import os
import json
from crewai import Agent, Task, Crew, LLM
from crewai.tools import tool
import dotenv
from supabase import create_client
from pydantic import BaseModel
from typing import List
import requests

dotenv.load_dotenv()

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

class ActionItem(BaseModel):
    employee_name: str
    employee_email: str
    task: str
    deadline: str

class MeetingSummary(BaseModel):
    summary: str
    action_items: List[ActionItem]
    

@tool
def get_employees():
    """Fetch all employees with their name and email from Supabase employees table."""
    response = supabase.table("employees").select("*").execute()
    return response.data  # list of dicts

llm = LLM(
    model="gemini/gemini-2.0-flash",  
    temperature=0.7,
    api_key=os.getenv("GEM_API_KEY"),  
    provider="gemini"  
)

summary_agent = Agent(
    role="You are a summary agent",
    goal="Summarize the transcript into concise meeting notes with action items. Also extract employees' names and emails from Supabase via the get_employees tool. Then output tasks with deadlines.",
    backstory="""You are a helpful assistant that extracts and structures tasks from meeting transcripts into a standardized JSON format for saving in a database.
        Return exactly one JSON object with two keys (summary and action_items). 
        Do NOT include any code fences or markdown formatting — return only the raw JSON, such as """,
    llm=llm,
    tools=[get_employees]
)

transcribe_task = Task(
    description="""
    Okay, Seshasayee I need you to complete the Diwali poster within 20th October.
    And Nisha, I expect you to be done with the Udemy course by November 3rd.
    Finally, reminder to everyone to be present on the coming Saturday as it's our office anniversary.
    """,
    expected_output="""
    Return exactly one JSON object with two keys, Do NOT include any code fences or markdown formatting:
    {
      "summary": "A concise summary of the meeting",
      "action_items": [
        {
          "employee_name": "string",
          "employee_email": "string",
          "task": "string",
          "deadline": "YYYY-MM-DD"
        }
      ]
    }
    """,
    output_json=MeetingSummary,
    agent=summary_agent
)

crew = Crew(
    agents=[summary_agent],
    tasks=[transcribe_task],
    verbose=True
)

result = crew.kickoff()
output = result.json_dict
    
    
payload = {
    "filename": random_filename,  # from Whisper output
    "transcript": transcript_text,
    "summary": output["summary"],
    "action_items": output["action_items"]
}

response = requests.post("http://your-node-server.com/api/meetings", json=payload)
print(response.json())