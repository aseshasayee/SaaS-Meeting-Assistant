// services/databaseService.js
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL and key are required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Get all employees from the database
 */
async function getEmployees() {
  const { data, error } = await supabase.from('employees').select('*');
  if (error) throw error;
  return data;
}

/**
 * Create a new employee
 */
async function createEmployee(name, email) {
  const { data, error } = await supabase
    .from('employees')
    .insert({ name, email })
    .select();
  if (error) throw error;
  return data[0];
}

/**
 * Find an employee by name
 */
async function findEmployeeByName(name) {
  // Try to find by exact name match first
  let { data, error } = await supabase
    .from('employees')
    .select('*')
    .ilike('name', name)
    .limit(1);

  if (error) throw error;

  // If found, return the employee
  if (data && data.length > 0) {
    return { found: true, employee: data[0] };
  }

  // If not found by exact name, try to find by similar name
  // This could be expanded with more sophisticated matching
  const { data: allEmployees, error: employeesError } = await supabase
    .from('employees')
    .select('*');
  
  if (employeesError) throw employeesError;
  
  // Simple fuzzy matching - look for name as substring
  const fuzzyMatch = allEmployees.find(emp => 
    emp.name.toLowerCase().includes(name.toLowerCase()) || 
    name.toLowerCase().includes(emp.name.toLowerCase())
  );
  
  if (fuzzyMatch) {
    return { found: true, employee: fuzzyMatch };
  }
  
  // No match found
  return { found: false };
}

/**
 * Insert or get an employee by email
 */
async function getOrCreateEmployee(name, email) {
  // First try to find the employee by name
  const { found, employee } = await findEmployeeByName(name);
  
  // If found by name, return it
  if (found) {
    return employee;
  }
  
  // If not found by name, try by email
  let { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('email', email)
    .limit(1);

  if (error) throw error;

  // If the employee exists by email, return it
  if (data && data.length > 0) {
    return data[0];
  }

  // Otherwise create a new employee
  return createEmployee(name, email);
}

/**
 * Create a new meeting
 */
async function createMeeting(filename, transcript) {
  const { data, error } = await supabase
    .from('meetings')
    .insert({ filename, transcript })
    .select();
  if (error) throw error;
  return data[0];
}

/**
 * Create a new task
 */
async function createTask(meeting_id, employee_id, task_description, due_date) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ meeting_id, employee_id, task_description, due_date })
    .select();
  if (error) throw error;
  return data[0];
}

/**
 * Get all tasks for an employee
 */
async function getEmployeeTasks(employee_id) {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      id,
      task_description,
      due_date,
      status,
      created_at,
      meetings (id, filename, transcript, created_at)
    `)
    .eq('employee_id', employee_id);
  if (error) throw error;
  return data;
}

/**
 * Process and save meeting data, including transcript and tasks
 */
async function processMeeting(filename, transcript, tasks) {
  // First, save the meeting
  const meeting = await createMeeting(filename, transcript);

  // Then, process each task
  const savedTasks = [];
  const unassignedTasks = [];
  
  for (const task of tasks) {
    try {
      // Try to find the employee by name first
      const { found, employee } = await findEmployeeByName(task.name);
      
      if (found) {
        // Employee found, create the task
        const savedTask = await createTask(
          meeting.id, 
          employee.id, 
          task.task, 
          task.due
        );
        
        savedTasks.push({
          ...savedTask,
          employee_name: employee.name,
          status: 'assigned'
        });
      } else {
        // No employee found, save as unassigned task
        console.log(`No employee found matching name: ${task.name}`);
        
        // Store task with null employee_id
        const unassignedTask = await createTask(
          meeting.id,
          null, // null employee_id
          task.task,
          task.due
        );
        
        unassignedTasks.push({
          ...unassignedTask,
          employee_name: task.name + " (not found)",
          status: 'unassigned'
        });
      }
    } catch (error) {
      console.error(`Error processing task for ${task.name}:`, error);
      unassignedTasks.push({
        meeting_id: meeting.id,
        employee_name: task.name + " (error)",
        task_description: task.task,
        due_date: task.due,
        status: 'error',
        error: error.message
      });
    }
  }
  
  return {
    meeting,
    tasks: [...savedTasks, ...unassignedTasks],
    assignedCount: savedTasks.length,
    unassignedCount: unassignedTasks.length
  };
}

module.exports = {
  getEmployees,
  createEmployee,
  getOrCreateEmployee,
  createMeeting,
  createTask,
  getEmployeeTasks,
  processMeeting
};