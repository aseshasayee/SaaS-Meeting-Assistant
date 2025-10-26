import os
import json
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from crewai import Agent, Task, Crew, LLM
from crewai.tools import tool
from supabase import create_client
from pydantic import BaseModel
from typing import List, Optional

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask
app = Flask(__name__)
CORS(app)

# Environment variables
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")

if not all([GEMINI_KEY, SUPABASE_URL, SUPABASE_KEY]):
    raise RuntimeError("Missing required environment variables")

# Initialize clients
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
llm = LLM(model="gemini/gemini-2.0-flash", temperature=0.2, api_key=GEMINI_KEY, provider="gemini")

# Pydantic models for structured output
class ActionItem(BaseModel):
    employee_name: Optional[str] = None
    employee_email: Optional[str] = None
    task: str
    deadline: Optional[str] = None

class MeetingSummary(BaseModel):
    summary: str
    action_items: List[ActionItem]

@tool
def get_company_employees(company_id: str) -> str:
    """Fetch all employees for a company from the database."""
    try:
        logger.info(f"🔍 Fetching employees for company_id: {company_id}")
        
        response = supabase.from_("employees").select("*").eq("company_id", company_id).execute()
        
        if response.data:
            employees = response.data
            logger.info(f"✅ Found {len(employees)} employees")
            return json.dumps({
                "employees": employees,
                "count": len(employees)
            })
        else:
            logger.warning(f"❌ No employees found for company {company_id}")
            return json.dumps({"employees": [], "count": 0})
            
    except Exception as e:
        logger.error(f"❌ Error fetching employees: {e}")
        return json.dumps({"error": str(e), "employees": [], "count": 0})

def create_summary_agent(company_id: str) -> Agent:
    """Create the meeting summary agent with company context."""
    return Agent(
        role="Meeting Summary Agent",
        goal=f"Summarize meetings and assign tasks to specific employees from company {company_id}",
        backstory=f"""
You are an AI assistant that processes meeting transcripts for company {company_id}.

Your job:
1. FIRST: Use the get_company_employees tool to fetch the list of employees
2. Summarize the meeting content
3. Extract actionable tasks and assign them to specific employees using their exact email addresses
4. Only assign tasks to employees that exist in the company database

IMPORTANT: You must use real employee emails from the database. Do not make up email addresses.
""",
        llm=llm,
        tools=[get_company_employees],
        verbose=True
    )

def process_meeting_transcript(transcript: str, company_id: str, user_id: str, meta: dict) -> dict:
    """Process a meeting transcript and return structured data."""
    try:
        logger.info(f"🔍 Processing transcript for company: {company_id}")
        
        # Create agent
        agent = create_summary_agent(company_id)
        
        # Create task
        task = Task(
            description=f"""
Analyze this meeting transcript and extract structured information:

TRANSCRIPT:
{transcript}

COMPANY_ID: {company_id}

INSTRUCTIONS:
1. Use the get_company_employees tool to get the list of employees for company {company_id}
2. Create a concise meeting summary
3. Extract action items and assign them to specific employees using their exact email addresses from the database
4. Set realistic deadlines based on the meeting context

Return a JSON object with this structure:
{{
    "summary": "Meeting summary here...",
    "action_items": [
        {{
            "employee_name": "Employee Name",
            "employee_email": "employee@company.com",
            "task": "Specific task description",
            "deadline": "2025-MM-DD" or null
        }}
    ]
}}
""",
            expected_output="JSON object with summary and action_items",
            agent=agent
        )
        
        # Execute
        crew = Crew(agents=[agent], tasks=[task], verbose=True)
        result = crew.kickoff()
        
        # Parse result
        return parse_crew_result(result)
        
    except Exception as e:
        logger.error(f"❌ Error processing transcript: {e}")
        return {
            "summary": "Error processing meeting",
            "action_items": [],
            "error": str(e)
        }

def parse_crew_result(result) -> dict:
    """Parse the crew result into a structured format."""
    try:
        # Try to get JSON from result
        if hasattr(result, 'json_dict') and result.json_dict:
            return result.json_dict
        
        # Try to parse as string
        result_str = str(result)
        if result_str.strip().startswith('{'):
            return json.loads(result_str)
        
        # Extract JSON from text
        import re
        json_match = re.search(r'(\{.*\})', result_str, re.DOTALL)
        if json_match:
            return json.loads(json_match.group(1))
        
        # Fallback
        return {
            "summary": result_str[:500] + "..." if len(result_str) > 500 else result_str,
            "action_items": []
        }
        
    except Exception as e:
        logger.error(f"❌ Error parsing result: {e}")
        return {
            "summary": "Error parsing meeting summary",
            "action_items": [],
            "error": str(e)
        }

def save_tasks_to_database(action_items: List[dict], meeting_id: str, company_id: str) -> List[dict]:
    """Save action items as tasks to the database."""
    try:
        if not action_items:
            return []
        
        tasks_to_insert = []
        
        for item in action_items:
            # Look up employee by email
            employee_id = None
            assigned_to = item.get('employee_name') or item.get('employee_email')
            
            if item.get('employee_email'):
                try:
                    emp_response = supabase.from_("employees").select("id, name").eq("email", item['employee_email']).eq("company_id", company_id).single()
                    if emp_response.data:
                        employee_id = emp_response.data['id']
                        assigned_to = emp_response.data['name']
                        logger.info(f"✅ Found employee: {assigned_to} ({employee_id})")
                except Exception as e:
                    logger.warning(f"❌ Employee lookup failed for {item.get('employee_email')}: {e}")
            
            # Prepare task data
            task_data = {
                "meeting_id": meeting_id,
                "employee_id": employee_id,
                "task_description": item.get('task', ''),
                "due_date": item.get('deadline'),
                "status": "pending",
                "company_id": company_id,
                # Add these for the API response mapping
                "title": item.get('task', '')[:50] + ("..." if len(item.get('task', '')) > 50 else ""),
                "assigned_to": assigned_to
            }
            
            tasks_to_insert.append(task_data)
        
        # Insert tasks
        if tasks_to_insert:
            logger.info(f"🔍 Inserting {len(tasks_to_insert)} tasks")
            response = supabase.from_("tasks").insert(tasks_to_insert).execute()
            
            if response.data:
                logger.info(f"✅ Successfully created {len(response.data)} tasks")
                return response.data
            else:
                logger.error(f"❌ Failed to insert tasks: {response}")
                return []
        
        return []
        
    except Exception as e:
        logger.error(f"❌ Error saving tasks: {e}")
        return []

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "service": "crew-ai"})

@app.route("/process-transcript", methods=["POST"])
def process_transcript():
    """Main endpoint to process meeting transcripts."""
    try:
        data = request.get_json()
        
        # Extract data
        transcript = data.get('transcript', '').strip()
        company_id = data.get('company_id')
        user_id = data.get('user_id')
        meta = data.get('meta', {})
        
        logger.info(f"🔍 Processing request - Company: {company_id}, User: {user_id}")
        
        if not transcript:
            return jsonify({"error": "transcript is required"}), 400
        
        if not company_id:
            return jsonify({"error": "company_id is required"}), 400
        
        # Process transcript
        result = process_meeting_transcript(transcript, company_id, user_id, meta)
        
        # Save meeting to database if not already saved
        meeting_id = None
        if meta.get('meeting_id'):
            meeting_id = meta['meeting_id']
        else:
            # Create meeting record
            meeting_data = {
                "filename": meta.get('filename', 'uploaded_file'),
                "transcript": transcript,
                "summary": result.get('summary'),
                "user_id": user_id,
                "company_id": company_id
            }
            
            meeting_response = supabase.from_("meetings").insert(meeting_data).execute()
            if meeting_response.data:
                meeting_id = meeting_response.data[0]['id']
                logger.info(f"✅ Created meeting: {meeting_id}")
        
        # Save tasks
        saved_tasks = []
        if meeting_id and result.get('action_items'):
            saved_tasks = save_tasks_to_database(result['action_items'], meeting_id, company_id)
        
        # Return response
        return jsonify({
            "meeting_summary": {
                "summary": result.get('summary', ''),
                "meeting_id": meeting_id
            },
            "action_items": result.get('action_items', []),
            "saved_tasks": saved_tasks,
            "emails": [],  # Email functionality can be added later
            "success": True
        })
        
    except Exception as e:
        logger.error(f"❌ Error in process_transcript: {e}")
        return jsonify({
            "error": str(e),
            "success": False
        }), 500

if __name__ == "__main__":
    logger.info("🚀 Starting Crew AI service...")
    app.run(host="0.0.0.0", port=5001, debug=True)