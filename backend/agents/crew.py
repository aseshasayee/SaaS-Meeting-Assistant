import os
from crewai import Agent, Task, Crew, LLM
from crewai.tools import tool
import dotenv
import dotenv
from supabase import create_client, Client

dotenv.load_dotenv()


supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

@tool
def get_employees():
    """Fetch all employees from Supabase employees table."""
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
    goal="Summarize the transcript into concise meeting notes with action items. Also extract the name of the employee, and their email from the employees.json file. Then read and extract the tasks given and the deadline provided.",
    backstory="You are a helpful assistant that helps employees summarize meeting transcripts into concise meeting notes with action items, by extracting the name of the employee, and their email from the employees.json file. Then read and extract the tasks given and the deadline provided.",
    llm=llm,
    tools=[get_employees]
)

transcribe_task = Task(
    description="""
    Okay, Seshasayee I need you to complete the Diwali poster within 20th October.
    And Nisha, I expect you to be done with the Udemy course by November 3rd.
    Finally, reminder to everyone to be present on the coming Saturday as it's our office anniversary.
""",
    expected_output="""A concise summary of the meeting. 
    And a json format output of the action items with the name of the employee, their email, task and deadline that is extracted from the transcript.
    Also make note that "everyone" means all employees in the employees table, so the mail includes all employees.
""",
    agent=summary_agent
)

crew = Crew(
    agents=[summary_agent],
    tasks=[transcribe_task],
    verbose=True
)

result = crew.kickoff()
print(result)