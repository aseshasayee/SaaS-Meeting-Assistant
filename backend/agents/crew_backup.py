import os
import re
import json
import logging
from datetime import date, datetime
from typing import List, Optional
from flask import Flask, request, jsonify
import dotenv
from pydantic import BaseModel
from crewai import Agent, Task, Crew, LLM
from crewai_tools import tool
from supabase import create_client

dotenv.load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("crew_service")
today = date.today().isoformat()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    logger.error("Supabase env vars missing")
    raise RuntimeError("Supabase env vars missing")

supabase = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

class ActionItem(BaseModel):
    employee_name: str
    employee_email: str
    task: str
    deadline: Optional[str] = None

class MeetingSummary(BaseModel):
    summary: str
    action_items: List[ActionItem]

GEMINI_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_KEY:
    logger.error("GEMINI_API_KEY missing")
    raise RuntimeError("GEMINI_API_KEY missing")

llm = LLM(
    model="gemini/gemini-2.0-flash",
    temperature=0.2,
    api_key=GEMINI_KEY,
    provider="gemini"
)

@tool
def get_company_employees(company_id: str = None):
    """
    Fetch all employees for a specific company from the database.
    This tool will be used to get the list of employees that can be assigned tasks.
    """
    try:
        logger.info(f"🔍 get_company_employees called with company_id: {company_id}")
        
        if company_id:
            response = supabase.table("employees").select("*").eq("company_id", company_id).execute()
        else:
            response = supabase.table("employees").select("*").execute()
        
        logger.info(f"🔍 Employee query response: {response}")
        
        if response.data:
            result = json.dumps({
                "employees": response.data,
                "count": len(response.data)
            })
            logger.info(f"✅ Found {len(response.data)} employees for company {company_id}")
            return result
        else:
            logger.warning(f"❌ No employees found for company {company_id}")
            return json.dumps({"employees": [], "count": 0})
    except Exception as e:
        logger.error(f"❌ Error fetching company employees: {e}")
        return json.dumps({"error": str(e), "employees": [], "count": 0})

summary_agent = Agent(
    role="Meeting Summary Agent",
    goal="Summarize the meeting transcript and extract structured action items assigning them to specific company employees by their email addresses.",
    backstory=f"""
You are a helpful assistant that extracts and structures tasks from meeting transcripts.
The current date is {today}. Use this as reference for all relative deadlines.

CRITICAL: You have access to a tool called 'get_company_employees' which you MUST use to get the list of employees for the company.
Only assign tasks to employees that exist in the company database using their exact email addresses.

Return exactly one JSON object with keys: 'summary' and 'action_items'.
Each action_item must have: employee_name, employee_email, task, deadline (YYYY-MM-DD or null).
Do NOT include any explanation, markdown, or code fences — return only raw JSON.
""",
    llm=llm,
    tools=[get_company_employees]
)

email_agent = Agent(
    role="Email Composer Agent",
    goal="Given a meeting summary and action items, compose a short friendly email draft for each action item.",
    backstory="""
You receive a JSON object like:
{"meeting_summary": "...", "action_items": [{"employee_name": "...", "employee_email": "...", "task": "...", "deadline": "YYYY-MM-DD"}]}
For each action_item return an object with: employee_email, subject, body.
Return a JSON array only (no extra text). Example:
[
  {"employee_email":"a@x.com","subject":"Task: Finish X","body":"Hi..."}
]
Do NOT include any markdown or explanation.
""",
    llm=llm
)

def safe_parse_json_from_result(result) -> Optional[dict]:
    try:
        if hasattr(result, "json_dict") and result.json_dict:
            return result.json_dict
    except Exception:
        pass
    raw_candidates = []
    for attr in ("output", "output_text", "raw_output", "text", "response"):
        if hasattr(result, attr):
            val = getattr(result, attr)
            if val:
                raw_candidates.append(val if isinstance(val, str) else str(val))
    joined = "\n".join(raw_candidates)
    if not joined:
        try:
            joined = str(result)
        except Exception:
            joined = ""
    try:
        return json.loads(joined)
    except Exception:
        pass
    patterns = [r"(\{(?:.|\n)*\})", r"(\[(?:.|\n)*\])"]
    for pat in patterns:
        m = re.search(pat, joined, re.DOTALL)
        if m:
            s = m.group(1)
            try:
                return json.loads(s)
            except Exception:
                try:
                    s_fixed = s.replace("“", '"').replace("”", '"').replace("’", "'")
                    return json.loads(s_fixed)
                except Exception:
                    continue
    return None

app = Flask(__name__)

@app.route("/process-transcript", methods=["POST"])
def process_transcript():
    payload = request.get_json(force=True, silent=True) or {}
    transcript = (payload.get("transcript") or "").strip()
    meeting_meta = payload.get("meta", {})
    company_id = payload.get("company_id")  # Company context
    user_id = payload.get("user_id")        # User context
    
    logger.info(f"🔍 Processing transcript for company_id: {company_id}, user_id: {user_id}")
    logger.info(f"🔍 Meeting meta: {meeting_meta}")
    
    if not transcript:
        return jsonify({"error": "transcript is required"}), 400

    errors = []
    meeting_row = None
    inserted_tasks = []
    emails = []

    # Insert meeting row with company context
    try:
        insert_payload = {
            "transcript": transcript,
            "company_id": company_id,
            "user_id": user_id
        }
        # Only add filename from meta, not company_name
        if meeting_meta and "filename" in meeting_meta:
            insert_payload["filename"] = meeting_meta["filename"]
        
        resp = supabase.from_("meetings").insert(insert_payload).execute()
        if resp.error:
            logger.error("Failed to insert meeting: %s", resp.error)
            errors.append({"meetings_insert": str(resp.error)})
        else:
            meeting_row = resp.data[0] if resp.data else None
    except Exception as e:
        logger.exception("Exception saving meeting")
        errors.append({"meetings_exception": str(e)})

    try:
        # Pass company_id to the tool context
        company_employees_context = ""
        if company_id:
            try:
                employees = get_company_employees(company_id)
                logger.info(f"🔍 Retrieved employees for context: {employees}")
                company_employees_context = f"\n\nAVAILABLE COMPANY EMPLOYEES:\n{employees}\n\nIMPORTANT: You MUST assign tasks only to employees from the above list using their exact email addresses."
            except Exception as e:
                logger.error(f"❌ Failed to get company employees: {e}")

        task_description = f"""
{transcript}

{company_employees_context}

INSTRUCTIONS:
1. First, use the get_company_employees tool to fetch the list of available employees for company_id: {company_id}
2. Summarize the meeting transcript
3. Extract action items and assign them to specific employees from the company
4. For each action item, you MUST include the exact employee_email from the company employees list
5. Return exactly one JSON object with 'summary' and 'action_items' keys
"""
        
        transcribe_task = Task(
            description=task_description,
            expected_output="""
Return exactly one JSON object with two keys:
{
  "summary": "string",
  "action_items": [
    {
      "employee_name": "string",
      "employee_email": "string",
      "task": "string",
      "deadline": "YYYY-MM-DD or null"
    }
  ]
}
No markdown, no explanation — only JSON.
""",
            output_json=MeetingSummary,
            agent=summary_agent
        )
        summary_crew = Crew(agents=[summary_agent], tasks=[transcribe_task], verbose=False)
        summary_result = summary_crew.kickoff()
        parsed_summary = safe_parse_json_from_result(summary_result)
        if not parsed_summary:
            errors.append({"summary_parse": "Could not parse summary output"})
            parsed_summary = {}
        crew_summary = parsed_summary.get("summary") or parsed_summary.get("meeting_summary") or parsed_summary
        action_items = parsed_summary.get("action_items") or (crew_summary.get("action_items") if isinstance(crew_summary, dict) else None) or []
        logger.info(f"🔍 Raw action_items from AI: {action_items}")
        
        normalized_items = []
        for ai in (action_items or []):
            try:
                normalized = {
                    "employee_name": ai.get("employee_name") if isinstance(ai, dict) else None,
                    "employee_email": ai.get("employee_email") if isinstance(ai, dict) else None,
                    "task": ai.get("task") if isinstance(ai, dict) else None,
                    "deadline": ai.get("deadline") if isinstance(ai, dict) else None
                }
                logger.info(f"🔍 Normalized action item: {normalized}")
                if normalized["task"]:
                    normalized_items.append(normalized)
            except Exception:
                continue
        # After agent output, update the meeting row with the summary if possible
        if meeting_row and crew_summary:
            try:
                summary_text = crew_summary if isinstance(crew_summary, str) else crew_summary.get("summary", "")
                update_resp = supabase.from_("meetings").update({"summary": summary_text}).eq("id", meeting_row["id"]).execute()
                if update_resp.error:
                    logger.error("Failed to update meeting summary: %s", update_resp.error)
                    errors.append({"meetings_update": str(update_resp.error)})
                else:
                    # Update local meeting_row with summary
                    meeting_row["summary"] = summary_text
            except Exception as e:
                logger.exception("Exception updating meeting summary")
                errors.append({"meetings_update_exception": str(e)})
    except Exception as e:
        logger.exception("Summary agent failed")
        errors.append({"summary_agent_exception": str(e)})
        normalized_items = []
        crew_summary = {"summary": "", "action_items": []}

    try:
        tasks_to_insert = []
        meeting_id = meeting_row.get("id") if meeting_row else None
        for ai in normalized_items:
            emp_id = None
            emp_name = None
            emp_email = None
            if ai.get("employee_email") and company_id:
                try:
                    logger.info(f"Looking up employee with email: {ai['employee_email']} for company: {company_id}")
                    emp_q = supabase.from_("employees").select("id, name, email").eq("email", ai["employee_email"]).eq("company_id", company_id).single()
                    logger.info(f"Employee query result: {emp_q}")
                    if emp_q and not emp_q.error and emp_q.data:
                        emp_id = emp_q.data.get("id")
                        emp_name = emp_q.data.get("name")
                        emp_email = emp_q.data.get("email")
                        logger.info(f"Found employee: id={emp_id}, name={emp_name}, email={emp_email}")
                    else:
                        logger.warning(f"No employee found with email {ai['employee_email']} in company {company_id}")
                        # Try to create the employee if they don't exist
                        try:
                            logger.info(f"Creating new employee: {ai['employee_email']}")
                            create_emp = supabase.from_("employees").insert({
                                "email": ai["employee_email"],
                                "name": ai.get("employee_name") or ai["employee_email"].split('@')[0],
                                "company_id": company_id
                            }).select().single()
                            if create_emp and not create_emp.error and create_emp.data:
                                emp_id = create_emp.data.get("id")
                                emp_name = create_emp.data.get("name")
                                emp_email = create_emp.data.get("email")
                                logger.info(f"Created employee: id={emp_id}, name={emp_name}, email={emp_email}")
                        except Exception as create_error:
                            logger.error(f"Failed to create employee: {create_error}")
                except Exception as lookup_error:
                    logger.error(f"Error looking up employee: {lookup_error}")
                    pass
            
            # Generate a title from the task description (first 50 chars)
            task_desc = ai.get("task") or ""
            task_title = task_desc[:50] + "..." if len(task_desc) > 50 else task_desc
            
            # Use employee name/email for assigned_to field
            assigned_to = emp_name or emp_email or ai.get("employee_name") or ai.get("employee_email")
            
            task_payload = {
                "meeting_id": meeting_id,
                "employee_id": emp_id,
                "title": task_title,
                "task_description": task_desc,
                "assigned_to": assigned_to,
                "due_date": ai.get("deadline") or None,
                "status": "pending",
                "company_id": company_id
            }
            logger.info(f"Task payload: {task_payload}")
            tasks_to_insert.append(task_payload)
        if tasks_to_insert:
            logger.info(f"🔍 Inserting {len(tasks_to_insert)} tasks into database")
            for i, task in enumerate(tasks_to_insert):
                logger.info(f"🔍 Task {i+1}: {task}")
            
            resp_tasks = supabase.from_("tasks").insert(tasks_to_insert).execute()
            logger.info(f"🔍 Task insertion response: {resp_tasks}")
            if resp_tasks.error:
                logger.error("Failed to insert tasks: %s", resp_tasks.error)
                errors.append({"tasks_insert": str(resp_tasks.error)})
            else:
                inserted_tasks = resp_tasks.data or []
                logger.info(f"✅ Successfully inserted {len(inserted_tasks)} tasks")
        else:
            logger.warning("🔍 No tasks to insert")
    except Exception as e:
        logger.exception("Exception inserting tasks")
        errors.append({"tasks_exception": str(e)})

    try:
        task_description = {
            "meeting_summary": parsed_summary.get("summary") if isinstance(parsed_summary, dict) else parsed_summary,
            "action_items": normalized_items
        }
        email_prompt = f"""
You are given the following meeting summary and action items JSON:
{json.dumps(task_description, indent=2)}

For each action item, compose a short, professional email draft.
Each email should contain the task, deadline (if any), and one sentence of context from the meeting summary.
Return your response as a JSON array only with objects:
[{{"employee_email":"", "subject":"", "body":""}}]
Do NOT include any other text or markdown.
"""
        email_task = Task(
            description=email_prompt,
            expected_output="JSON array as specified",
            agent=email_agent
        )
        email_crew = Crew(agents=[email_agent], tasks=[email_task], verbose=False)
        email_result = email_crew.kickoff()
        parsed_emails = safe_parse_json_from_result(email_result)
        if not parsed_emails:
            logger.warning("Email agent produced non-JSON output; capturing raw output for debugging")
            raw_text = ""
            for attr in ("output", "output_text", "raw_output", "text"):
                if hasattr(email_result, attr):
                    raw_text = getattr(email_result, attr) or raw_text
            m = re.search(r"(\[(?:.|\n)*\])", raw_text, re.DOTALL)
            if m:
                try:
                    parsed_emails = json.loads(m.group(1))
                except Exception:
                    parsed_emails = []
            else:
                parsed_emails = []
        if isinstance(parsed_emails, list):
            for e in parsed_emails:
                if isinstance(e, dict) and e.get("employee_email"):
                    emails.append({
                        "employee_email": e.get("employee_email"),
                        "subject": e.get("subject") or "",
                        "body": e.get("body") or ""
                    })
        else:
            emails = []
    except Exception as e:
        logger.exception("Email agent failed")
        errors.append({"email_agent_exception": str(e)})
        emails = []

    response = {
        "meeting": meeting_row,
        "meeting_summary": {
            "summary": crew_summary if isinstance(crew_summary, str) else crew_summary.get("summary", "")
        },
        "action_items": normalized_items,
        "emails": emails,
        "dbTasks": inserted_tasks,
        "errors": errors
    }

    return jsonify(response), (200 if not errors else 207)

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "healthy",
        "service": "ai-agent",
        "timestamp": datetime.now().isoformat()
    }), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5001)))
