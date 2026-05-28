"""
CAIE Vault — Backend API
FastAPI + SQLite + PyMuPDF
"""

import os
import json
import sqlite3
import re
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import fitz  # PyMuPDF
from rapidfuzz import fuzz

# ── Config ────────────────────────────────────────────────────────────────────
DB_PATH        = os.environ.get("DB_PATH", "papers.db")
UPLOAD_DIR     = os.environ.get("UPLOAD_DIR", "uploads")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "caievault2024")
SUPABASE_URL   = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY   = os.environ.get("SUPABASE_KEY", "")
BUCKET_NAME    = "papers"

os.makedirs(UPLOAD_DIR, exist_ok=True)

def get_supabase():
    if SUPABASE_URL and SUPABASE_KEY:
        from supabase import create_client
        return create_client(SUPABASE_URL, SUPABASE_KEY)
    return None

# ── DB helpers ────────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS papers (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            filename     TEXT NOT NULL,
            subject      TEXT,
            level        TEXT,
            year         TEXT,
            session      TEXT,
            paper_num    TEXT,
            component    TEXT,
            full_text    TEXT,
            questions    TEXT,
            uploaded_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Add component column if upgrading from older DB
    try:
        c.execute("ALTER TABLE papers ADD COLUMN component TEXT")
    except Exception:
        pass
    try:
        c.execute("ALTER TABLE papers ADD COLUMN paper_url TEXT")
    except Exception:
        pass
    conn.commit()
    conn.close()

# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="CAIE Vault API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Auth ──────────────────────────────────────────────────────────────────────
def verify_admin(x_admin_password: str = Header(None)):
    if x_admin_password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return True

# ── PDF helpers ───────────────────────────────────────────────────────────────
SUBJECT_MAP = {
    "9702": ("Physics",          "A Level"),
    "9701": ("Chemistry",        "A Level"),
    "9709": ("Mathematics",      "A Level"),
    "9618": ("Computer Science", "A Level"),
    "9700": ("Biology",          "A Level"),
    "9706": ("Accounting",       "A Level"),
    "9708": ("Economics",        "A Level"),
    "9389": ("History",          "A Level"),
    "7096": ("Mathematics",      "O Level"),
    "5090": ("Chemistry",        "O Level"),
    "5054": ("Physics",          "O Level"),
    "5070": ("Chemistry",        "O Level"),
    "2058": ("Islamiyat",        "O Level"),
    "0625": ("Physics",          "IGCSE"),
    "0620": ("Chemistry",        "IGCSE"),
    "0580": ("Mathematics",      "IGCSE"),
    "2210": ("Computer Science", "IGCSE"),
    "0470": ("History",          "IGCSE"),
    "0610": ("Biology",          "IGCSE"),
    "0455": ("Economics",        "IGCSE"),
}
SESSION_MAP = {"s": "Summer", "w": "Winter", "m": "March"}

# Maths (9709) paper component mapping by first digit of paper number
MATHS_COMPONENTS = {
    "1": "Pure 1 (P1)",
    "2": "Pure 2 (P2)",
    "3": "Pure 3 (P3)",
    "4": "Mechanics 1 (M1)",
    "5": "Mechanics 2 (M2)",
    "6": "Statistics 1 (S1)",
    "7": "Statistics 2 (S2)",
}

# AS Level papers: paper numbers 1,2,3 (and variants like 11,12,13,21,22,23,31,32,33)
# A2 Level papers: paper numbers 4,5 (and variants like 41,42,43,51,52,53)
AS_PAPERS = {"1","2","3","11","12","13","21","22","23","31","32","33"}
A2_PAPERS = {"4","5","41","42","43","51","52","53"}

def parse_filename(filename):
    name  = filename.lower().replace(".pdf", "")
    parts = name.split("_")
    subject, level = "Unknown", "Unknown"
    year, session, paper_num = "Unknown", "Unknown", "Unknown"

    if parts:
        info = SUBJECT_MAP.get(parts[0])
        if info:
            subject, level = info
        else:
            subject = parts[0].upper()

    if len(parts) >= 2:
        sess_code = parts[1][0] if parts[1] else ""
        year_code = parts[1][1:] if len(parts[1]) > 1 else ""
        session   = SESSION_MAP.get(sess_code, sess_code.upper())
        year      = "20" + year_code if len(year_code) == 2 else year_code

    component = None
    if len(parts) >= 4:
        paper_num = parts[3]
        # For A Level papers, refine into AS or A2
        if level == "A Level":
            if paper_num in AS_PAPERS:
                level = "AS Level"
            elif paper_num in A2_PAPERS:
                level = "A2 Level"
        # For Maths, detect component from first digit of paper number
        if parts[0] == "9709" and paper_num:
            first_digit = paper_num[0]
            component = MATHS_COMPONENTS.get(first_digit)

    return subject, level, year, session, paper_num, component

def extract_text(filepath):
    try:
        doc  = fitz.open(filepath)
        text = "\n".join(page.get_text() for page in doc)
        doc.close()
        return text
    except Exception as e:
        return f"[Error: {e}]"

def extract_questions(full_text):
    questions = []
    pattern   = re.compile(
        r'(?:^|\n)\s*(\d{1,2})\s*[\.\)]\s*(?=[A-Z(\[])',
        re.MULTILINE
    )
    matches = list(pattern.finditer(full_text))

    if not matches:
        questions.append({"num": "1", "text": full_text[:3000].strip()})
        return questions

    for i, match in enumerate(matches):
        q_num = match.group(1)
        start = match.end()
        end   = matches[i + 1].start() if i + 1 < len(matches) else len(full_text)
        text  = full_text[start:end].strip()
        if text and len(text) > 10:
            questions.append({"num": q_num, "text": text[:2500]})

    return questions

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "name": "CAIE Vault"}

# Public: list available subjects + levels (for setup screen)
@app.get("/api/catalog")
def catalog(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        "SELECT DISTINCT subject, level FROM papers ORDER BY level, subject"
    ).fetchall()
    # Get maths components if available
    maths_components = db.execute(
        "SELECT DISTINCT component FROM papers WHERE subject='Mathematics' AND component IS NOT NULL ORDER BY component"
    ).fetchall()
    return {
        "catalog": [dict(r) for r in rows],
        "maths_components": [r["component"] for r in maths_components]
    }

# Public: download questions for selected subjects (for offline cache)
@app.get("/api/download")
def download_questions(
    subjects: str,   # comma-separated e.g. "Physics,Chemistry"
    level: str,
    components: Optional[str] = None,  # comma-separated maths components e.g. "Pure 1 (P1),Statistics 1 (S1)"
    db: sqlite3.Connection = Depends(get_db)
):
    subject_list = [s.strip() for s in subjects.split(",") if s.strip()]
    placeholders = ",".join("?" * len(subject_list))
    
    # Build query - for maths with components, filter by component too
    component_list = [c.strip() for c in components.split(",") if c.strip()] if components else []
    
    if component_list and "Mathematics" in subject_list:
        # Get non-maths subjects normally + maths with component filter
        non_maths = [s for s in subject_list if s != "Mathematics"]
        rows = []
        
        if non_maths:
            ph = ",".join("?" * len(non_maths))
            r = db.execute(
                f"SELECT filename, subject, level, year, session, paper_num, component, questions "
                f"FROM papers WHERE level=? AND subject IN ({ph})",
                [level] + non_maths
            ).fetchall()
            rows.extend(r)
        
        # Maths with component filter
        comp_ph = ",".join("?" * len(component_list))
        r = db.execute(
            f"SELECT filename, subject, level, year, session, paper_num, component, questions "
            f"FROM papers WHERE subject='Mathematics' AND component IN ({comp_ph})",
            component_list
        ).fetchall()
        rows.extend(r)
    else:
        rows = db.execute(
            f"SELECT filename, subject, level, year, session, paper_num, component, questions "
            f"FROM papers WHERE level=? AND subject IN ({placeholders})",
            [level] + subject_list
        ).fetchall()

    all_questions = []
    for row in rows:
        if not row["questions"]:
            continue
        try:
            qs = json.loads(row["questions"])
            for q in qs:
                # Build Supabase URLs
                fname = row["filename"]
                ms_fname = fname.replace("_qp_", "_ms_").replace("_QP_", "_ms_")
                paper_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{fname}" if SUPABASE_URL else None
                ms_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{ms_fname}" if SUPABASE_URL else None
                all_questions.append({
                    "filename":  fname,
                    "subject":   row["subject"],
                    "level":     row["level"],
                    "year":      row["year"],
                    "session":   row["session"],
                    "paper_num": row["paper_num"],
                    "component": row["component"] if "component" in row.keys() else None,
                    "q_num":     q.get("num", "?"),
                    "text":      q.get("text", ""),
                    "paper_url": paper_url,
                    "ms_url":    ms_url,
                })
        except Exception:
            pass

    return {"questions": all_questions, "count": len(all_questions)}

# Public: online search (fallback if user is online)
class SearchRequest(BaseModel):
    query:    str
    subjects: Optional[list[str]] = None
    level:    Optional[str]       = None
    threshold: Optional[int]      = 40

@app.post("/api/search")
def search(req: SearchRequest, db: sqlite3.Connection = Depends(get_db)):
    if not req.query.strip():
        raise HTTPException(400, "Query cannot be empty")

    sql    = "SELECT filename, subject, level, year, session, paper_num, questions FROM papers WHERE 1=1"
    params = []

    if req.level and req.level != "All":
        sql += " AND level=?"
        params.append(req.level)

    if req.subjects:
        placeholders = ",".join("?" * len(req.subjects))
        sql += f" AND subject IN ({placeholders})"
        params.extend(req.subjects)

    rows = db.execute(sql, params).fetchall()

    all_questions = []
    for row in rows:
        if not row["questions"]:
            continue
        try:
            qs = json.loads(row["questions"])
            for q in qs:
                all_questions.append({
                    "filename":  row["filename"],
                    "subject":   row["subject"],
                    "level":     row["level"],
                    "year":      row["year"],
                    "session":   row["session"],
                    "paper_num": row["paper_num"],
                    "q_num":     q.get("num", "?"),
                    "text":      q.get("text", ""),
                })
        except Exception:
            pass

    query_lower = req.query.lower()
    results     = []
    for q in all_questions:
        score = fuzz.partial_ratio(query_lower, q["text"].lower())
        if score >= (req.threshold or 40):
            results.append({"score": score, **q})

    results.sort(key=lambda x: -x["score"])
    return {"results": results[:30]}

# ── AI Chat endpoint ─────────────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    subjects: Optional[list[str]] = None
    level: Optional[str] = None

@app.post("/api/chat")
async def chat(req: ChatRequest):
    try:
        import httpx
        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            raise HTTPException(400, "AI not configured. Add GEMINI_API_KEY to environment variables.")
        
        subjects = ", ".join(req.subjects) if req.subjects else "various subjects"
        level = req.level or "A Level"
        
        system_instruction = f"""You are a CAIE exam study assistant helping a student studying {level}: {subjects}.
Answer questions clearly and concisely. Use examples where helpful.
For calculations, show step-by-step working.
Keep answers focused on CAIE syllabus requirements.
Format responses clearly with bullet points or numbered steps where appropriate."""

        # Build conversation history for Gemini
        gemini_messages = []
        for m in req.messages:
            role = "user" if m.role == "user" else "model"
            gemini_messages.append({"role": role, "parts": [{"text": m.content}]})

        payload = {
            "system_instruction": {"parts": [{"text": system_instruction}]},
            "contents": gemini_messages,
            "generationConfig": {"maxOutputTokens": 1000, "temperature": 0.7}
        }

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}",
                json=payload
            )
            data = response.json()
        
        reply = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "Sorry, I could not get a response.")
        return {"reply": reply}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

# ── Admin routes ──────────────────────────────────────────────────────────────

@app.post("/api/admin/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    db:   sqlite3.Connection = Depends(get_db),
    _:    bool = Depends(verify_admin)
):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files allowed")

    existing = db.execute(
        "SELECT id FROM papers WHERE filename=?", (file.filename,)
    ).fetchone()
    if existing:
        return {"status": "skipped", "message": f"{file.filename} already indexed"}

    filepath = os.path.join(UPLOAD_DIR, file.filename)
    file_bytes = await file.read()
    with open(filepath, "wb") as f:
        f.write(file_bytes)

    # Upload to Supabase Storage for permanent hosting
    supabase_client = get_supabase()
    public_url = None
    if supabase_client:
        try:
            supabase_client.storage.from_(BUCKET_NAME).upload(
                file.filename, file_bytes,
                {"content-type": "application/pdf", "upsert": "true"}
            )
            public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{file.filename}"
        except Exception as e:
            print(f"Supabase upload warning: {e}")

    subject, level, year, session, paper_num, component = parse_filename(file.filename)
    full_text = extract_text(filepath)
    questions = extract_questions(full_text)

    # Build mark scheme filename and URL
    ms_filename = file.filename.replace("_qp_", "_ms_").replace("_QP_", "_ms_")
    ms_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_NAME}/{ms_filename}" if SUPABASE_URL else None

    db.execute("""
        INSERT INTO papers (filename, subject, level, year, session, paper_num, component, full_text, questions)
        VALUES (?,?,?,?,?,?,?,?,?)
    """, (file.filename, subject, level, year, session, paper_num, component,
          full_text, json.dumps(questions)))
    db.commit()

    return {
        "status":          "ok",
        "filename":        file.filename,
        "subject":         subject,
        "level":           level,
        "year":            year,
        "session":         session,
        "paper_num":       paper_num,
        "component":       component,
        "questions_found": len(questions),
        "paper_url":       public_url,
        "ms_url":          ms_url,
    }

@app.get("/api/admin/papers")
def list_papers(
    db: sqlite3.Connection = Depends(get_db),
    _:  bool = Depends(verify_admin)
):
    rows = db.execute(
        "SELECT id, filename, subject, level, year, session, paper_num, uploaded_at "
        "FROM papers ORDER BY level, subject, year DESC"
    ).fetchall()
    return {"papers": [dict(r) for r in rows]}

@app.delete("/api/admin/papers/{paper_id}")
def delete_paper(
    paper_id: int,
    db: sqlite3.Connection = Depends(get_db),
    _:  bool = Depends(verify_admin)
):
    row = db.execute("SELECT filename FROM papers WHERE id=?", (paper_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Not found")
    filepath = os.path.join(UPLOAD_DIR, row["filename"])
    if os.path.exists(filepath):
        os.remove(filepath)
    db.execute("DELETE FROM papers WHERE id=?", (paper_id,))
    db.commit()
    return {"status": "deleted"}

# ── Serve built frontend ──────────────────────────────────────────────────────
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount(
        "/assets",
        StaticFiles(directory=os.path.join(frontend_dist, "assets")),
        name="assets"
    )

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        return FileResponse(os.path.join(frontend_dist, "index.html"))
