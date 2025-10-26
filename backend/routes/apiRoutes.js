const express = require('express');
const { supabase } = require('../db');
const router = express.Router();

// Middleware to authenticate user and get company info
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Get user profile with company info
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select(`
        *,
        companies (
          id,
          name
        )
      `)
      .eq('id', user.id)
      .single();

    if (profileError) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    req.user = user;
    req.userProfile = profile;
    req.companyId = profile.company_id;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Get user profile with company info
router.get('/profile', authenticateUser, async (req, res) => {
  try {
    res.json({ 
      profile: req.userProfile,
      company: req.userProfile.companies
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get company employees
router.get('/employees', authenticateUser, async (req, res) => {
  try {
    const { data: employees, error } = await supabase
      .from('employees')
      .select('*')
      .eq('company_id', req.companyId)
      .order('name');

    if (error) throw error;

    res.json({ employees: employees || [] });
  } catch (error) {
    console.error('Employees fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add employee to company
router.post('/employees', authenticateUser, async (req, res) => {
  try {
    const { name, email, department } = req.body;

    const { data: employee, error } = await supabase
      .from('employees')
      .insert({
        name,
        email,
        department,
        company_id: req.companyId
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ employee });
  } catch (error) {
    console.error('Employee creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get company meetings
router.get('/meetings', authenticateUser, async (req, res) => {
  try {
    const { data: meetings, error } = await supabase
      .from('meetings')
      .select(`
        *,
        tasks(count)
      `)
      .eq('company_id', req.companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ meetings: meetings || [] });
  } catch (error) {
    console.error('Meetings fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get meeting details
router.get('/meetings/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: meeting, error } = await supabase
      .from('meetings')
      .select(`
        *,
        tasks(*)
      `)
      .eq('id', id)
      .eq('company_id', req.companyId)
      .single();

    if (error) throw error;

    res.json({ meeting });
  } catch (error) {
    console.error('Meeting fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get company tasks
router.get('/tasks', authenticateUser, async (req, res) => {
  try {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select(`
        *,
        meetings(filename, created_at),
        employees(name, email)
      `)
      .eq('company_id', req.companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ tasks: tasks || [] });
  } catch (error) {
    console.error('Tasks fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get dashboard stats for company
router.get('/dashboard-stats', authenticateUser, async (req, res) => {
  try {
    // Get total meetings for company
    const { count: totalMeetings } = await supabase
      .from('meetings')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', req.companyId);

    // Get total tasks for company
    const { count: totalTasks } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', req.companyId);

    // Get total employees
    const { count: totalEmployees } = await supabase
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', req.companyId);

    // Get pending tasks
    const { count: pendingTasks } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', req.companyId)
      .eq('status', 'pending');

    // Get recent meetings
    const { data: recentMeetings } = await supabase
      .from('meetings')
      .select('id, filename, created_at, summary')
      .eq('company_id', req.companyId)
      .order('created_at', { ascending: false })
      .limit(5);

    res.json({
      stats: {
        totalMeetings: totalMeetings || 0,
        totalTasks: totalTasks || 0,
        totalEmployees: totalEmployees || 0,
        pendingTasks: pendingTasks || 0
      },
      recentMeetings: recentMeetings || []
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

// Get user meetings with pagination and search
router.get('/meetings', authenticateUser, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status;

    let query = supabase
      .from('meetings')
      .select(`
        *,
        tasks(count)
      `)
      .eq('user_id', req.user.id);

    if (search) {
      query = query.or(`filename.ilike.%${search}%,meeting_notes.ilike.%${search}%`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: meetings, error: meetingsError } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (meetingsError) throw meetingsError;

    // Get total count
    const { count, error: countError } = await supabase
      .from('meetings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);

    if (countError) throw countError;

    res.json({
      meetings: meetings || [],
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Meetings fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get meeting details
router.get('/meetings/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select(`
        *,
        tasks(*),
        meeting_participants(*)
      `)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (meetingError) throw meetingError;

    res.json({ meeting });
  } catch (error) {
    console.error('Meeting fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update meeting
router.put('/meetings/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, meeting_notes, tags } = req.body;

    const { data: meeting, error: updateError } = await supabase
      .from('meetings')
      .update({
        status,
        meeting_notes,
        tags,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({ meeting });
  } catch (error) {
    console.error('Meeting update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete meeting
router.delete('/meetings/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    const { error: deleteError } = await supabase
      .from('meetings')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (deleteError) throw deleteError;

    res.json({ success: true });
  } catch (error) {
    console.error('Meeting delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user tasks with filters
router.get('/tasks', authenticateUser, async (req, res) => {
  try {
    const { status, priority, search } = req.query;
    
    let query = supabase
      .from('tasks')
      .select(`
        *,
        meetings!inner(filename, created_at, user_id)
      `)
      .eq('meetings.user_id', req.user.id);

    if (status) query = query.eq('status', status);
    if (priority) query = query.eq('priority', priority);
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: tasks, error: tasksError } = await query
      .order('created_at', { ascending: false });

    if (tasksError) throw tasksError;

    res.json({ tasks: tasks || [] });
  } catch (error) {
    console.error('Tasks fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create task
router.post('/tasks', authenticateUser, async (req, res) => {
  try {
    const { title, description, priority, assigned_to, due_date, meeting_id } = req.body;

    const { data: task, error: createError } = await supabase
      .from('tasks')
      .insert({
        user_id: req.user.id,
        meeting_id,
        title,
        description,
        priority: priority || 'medium',
        assigned_to,
        due_date,
        status: 'pending'
      })
      .select()
      .single();

    if (createError) throw createError;

    res.json({ task });
  } catch (error) {
    console.error('Task creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update task
router.put('/tasks/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, title, description, assigned_to, due_date } = req.body;

    const updateData = {
      status,
      priority,
      title,
      description,
      assigned_to,
      due_date,
      updated_at: new Date().toISOString()
    };

    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { data: task, error: updateError } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({ task });
  } catch (error) {
    console.error('Task update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete task
router.delete('/tasks/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (deleteError) throw deleteError;

    res.json({ success: true });
  } catch (error) {
    console.error('Task delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get employees
router.get('/employees', authenticateUser, async (req, res) => {
  try {
    const { data: employees, error } = await supabase
      .from('employees')
      .select('*')
      .eq('user_id', req.user.id)
      .order('name');

    if (error) throw error;

    res.json({ employees: employees || [] });
  } catch (error) {
    console.error('Employees fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add employee
router.post('/employees', authenticateUser, async (req, res) => {
  try {
    const { name, email, department, position, phone, join_date } = req.body;

    const { data: employee, error } = await supabase
      .from('employees')
      .insert({
        user_id: req.user.id,
        name,
        email,
        department,
        position,
        phone,
        join_date,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ employee });
  } catch (error) {
    console.error('Employee creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update employee
router.put('/employees/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, department, position, phone, join_date, status } = req.body;

    const { data: employee, error: updateError } = await supabase
      .from('employees')
      .update({
        name,
        email,
        department,
        position,
        phone,
        join_date,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({ employee });
  } catch (error) {
    console.error('Employee update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete employee
router.delete('/employees/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    const { error: deleteError } = await supabase
      .from('employees')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (deleteError) throw deleteError;

    res.json({ success: true });
  } catch (error) {
    console.error('Employee delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get dashboard stats
router.get('/dashboard-stats', authenticateUser, async (req, res) => {
  try {
    // Get total meetings
    const { count: totalMeetings } = await supabase
      .from('meetings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);

    // Get total tasks from user's meetings
    const { count: totalTasks } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);

    // Get completed tasks
    const { count: completedTasks } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('status', 'completed');

    // Get pending tasks
    const { count: pendingTasks } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('status', 'pending');

    // Get overdue tasks
    const today = new Date().toISOString().split('T')[0];
    const { count: overdueTasks } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .neq('status', 'completed')
      .lt('due_date', today);

    // Get recent meetings
    const { data: recentMeetings } = await supabase
      .from('meetings')
      .select('id, filename, created_at, status, meeting_type')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    // Get upcoming tasks
    const { data: upcomingTasks } = await supabase
      .from('tasks')
      .select('id, title, due_date, priority, status')
      .eq('user_id', req.user.id)
      .neq('status', 'completed')
      .gte('due_date', today)
      .order('due_date', { ascending: true })
      .limit(5);

    res.json({
      stats: {
        totalMeetings: totalMeetings || 0,
        totalTasks: totalTasks || 0,
        completedTasks: completedTasks || 0,
        pendingTasks: pendingTasks || 0,
        overdueTasks: overdueTasks || 0
      },
      recentMeetings: recentMeetings || [],
      upcomingTasks: upcomingTasks || []
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get notifications
router.get('/notifications', authenticateUser, async (req, res) => {
  try {
    const { data: notifications, error: notifError } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (notifError) {
      // If table doesn't exist, return empty array
      if (notifError.code === 'PGRST205') {
        return res.json({ notifications: [] });
      }
      throw notifError;
    }

    res.json({ notifications: notifications || [] });
  } catch (error) {
    console.error('Notifications fetch error:', error);
    res.json({ notifications: [] }); // Return empty array instead of error
  }
});

// Mark notification as read
router.put('/notifications/:id/read', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: notification, error: updateError } = await supabase
      .from('notifications')
      .update({ read: true, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({ notification });
  } catch (error) {
    console.error('Notification update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mark all notifications as read
router.put('/notifications/read-all', authenticateUser, async (req, res) => {
  try {
    const { data: notifications, error: updateError } = await supabase
      .from('notifications')
      .update({ read: true, updated_at: new Date().toISOString() })
      .eq('user_id', req.user.id)
      .eq('read', false)
      .select();

    if (updateError) throw updateError;

    res.json({ notifications: notifications || [] });
  } catch (error) {
    console.error('Notifications update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create notification
router.post('/notifications', authenticateUser, async (req, res) => {
  try {
    const { title, message, type, action_url, metadata } = req.body;

    const { data: notification, error: createError } = await supabase
      .from('notifications')
      .insert({
        user_id: req.user.id,
        title,
        message,
        type: type || 'info',
        action_url,
        metadata: metadata || {}
      })
      .select()
      .single();

    if (createError) throw createError;

    res.json({ notification });
  } catch (error) {
    console.error('Notification creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;