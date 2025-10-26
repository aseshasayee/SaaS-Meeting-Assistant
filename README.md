# Meeting Assistant SaaS - Modern React Frontend

A complete SaaS application for meeting transcript processing and task management with AI-powered analysis.

## 🚀 Features

### Frontend
- **Modern React UI** with Tailwind CSS
- **Authentication** with Supabase Auth
- **Responsive Design** with mobile-first approach
- **Dashboard** with real-time statistics
- **Meeting Management** with file upload and transcript processing
- **Task Management** with CRUD operations and status tracking
- **Team Management** for employee data
- **Real-time Notifications** system

### Backend
- **Node.js/Express** API server
- **Python Flask** AI agent service (CrewAI)
- **Gmail SMTP** integration for automated emails
- **File upload** handling with multer
- **Database integration** with Supabase PostgreSQL

### Infrastructure
- **Docker** containerization ready
- **Microservice architecture** with HTTP communication
- **PostgreSQL** database with Row Level Security
- **RESTful API** with comprehensive endpoints

## 📋 Prerequisites

- Node.js 18+ and npm
- Python 3.8+ and pip
- Docker (optional, for containerization)
- Supabase account
- Gmail account with App Password

## 🔧 Installation

### 1. Clone and Setup

```bash
git clone <your-repo>
cd saas
```

### 2. Backend Setup

```bash
cd backend
npm install

# Install Python dependencies
pip install flask flask-cors requests openai python-dotenv crewai
```

### 3. Frontend Setup

```bash
cd frontend
npm install
```

### 4. Environment Configuration

Create `.env` file in the backend directory:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key

# Gmail SMTP Configuration
GMAIL_USER=your_email@gmail.com
GMAIL_PASS=your_app_password

# API Configuration
PORT=5000
CREW_AI_URL=http://localhost:5001

# OpenAI (for CrewAI agent)
OPENAI_API_KEY=your_openai_api_key
```

Create `.env.local` file in the frontend directory:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_URL=http://localhost:5000
```

### 5. Database Setup

1. Go to your Supabase dashboard
2. Create a new project
3. Run the SQL script from `database_enhancement.sql` in the SQL editor
4. Enable Row Level Security on all tables

## 🗄️ Database Schema

The application uses the following main tables:

- **user_profiles** - User profile information
- **meetings** - Meeting records and metadata
- **tasks** - Task management with status tracking
- **employees** - Team member information
- **notifications** - User notifications
- **meeting_participants** - Meeting attendee data
- **meeting_analytics** - Meeting analytics and insights

## 🚀 Running the Application

### Development Mode

1. **Start the Python AI Agent**:
```bash
cd backend/agents
python crew.py
```

2. **Start the Node.js Backend**:
```bash
cd backend
npm start
```

3. **Start the React Frontend**:
```bash
cd frontend
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000
- AI Agent: http://localhost:5001

### Docker Deployment

1. **Build and run with Docker Compose**:
```bash
docker-compose up --build
```

This will start all services in containers.

## 📁 Project Structure

```
saas/
├── backend/
│   ├── agents/
│   │   ├── crew.py          # CrewAI agent service
│   │   └── task_allot.py    # Task allocation logic
│   ├── controllers/
│   │   ├── meetingController.js
│   │   └── transcribe.py    # Python transcription service
│   ├── routes/
│   │   ├── apiRoutes.js     # Comprehensive API endpoints
│   │   └── meetingRoutes.js
│   ├── services/
│   │   └── databaseService.js
│   ├── uploads/             # File upload directory
│   ├── transcripts/         # Processed transcripts
│   ├── server.js           # Main Express server
│   ├── db.js               # Database configuration
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── Layout.jsx   # Main layout with sidebar
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx # Authentication context
│   │   ├── pages/
│   │   │   ├── AuthPage.jsx     # Login/Signup
│   │   │   ├── DashboardPage.jsx # Dashboard with stats
│   │   │   ├── UploadPage.jsx   # File upload interface
│   │   │   ├── MeetingsPage.jsx # Meeting management
│   │   │   ├── TasksPage.jsx    # Task management
│   │   │   └── TeamPage.jsx     # Team management
│   │   ├── services/
│   │   │   └── api.js       # API service layer
│   │   ├── App.jsx          # Main app with routing
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   └── tailwind.config.js
├── database_enhancement.sql # Database setup script
├── docker-compose.yml      # Docker orchestration
├── Dockerfile             # Multi-stage Docker build
└── README.md
```

## 🔌 API Endpoints

### Authentication
- All API endpoints require Bearer token authentication
- Use Supabase auth token in Authorization header

### Main Endpoints

#### User Profile
- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update user profile

#### Meetings
- `GET /api/meetings` - List meetings with pagination
- `GET /api/meetings/:id` - Get meeting details
- `PUT /api/meetings/:id` - Update meeting
- `DELETE /api/meetings/:id` - Delete meeting

#### Tasks
- `GET /api/tasks` - List tasks with filters
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

#### Team Management
- `GET /api/employees` - List employees
- `POST /api/employees` - Add employee
- `PUT /api/employees/:id` - Update employee
- `DELETE /api/employees/:id` - Delete employee

#### Dashboard & Analytics
- `GET /api/dashboard-stats` - Get dashboard statistics
- `GET /api/notifications` - Get user notifications
- `PUT /api/notifications/:id/read` - Mark notification as read

#### File Upload & Processing
- `POST /upload` - Upload meeting transcript
- File processing triggers AI analysis and task extraction

## 🎨 UI Components

### Pages
- **AuthPage** - Modern gradient login/signup with Supabase Auth UI
- **DashboardPage** - Statistics cards, recent meetings, upcoming tasks
- **UploadPage** - Drag-and-drop file upload with progress tracking
- **MeetingsPage** - Table view with search, pagination, and details modal
- **TasksPage** - Kanban-style task management with filters
- **TeamPage** - Employee grid with management capabilities

### Features
- **Responsive Design** - Mobile-first with Tailwind CSS
- **Dark/Light Mode** - Ready for theme switching
- **Loading States** - Skeleton loaders and spinners
- **Error Handling** - User-friendly error messages
- **Real-time Updates** - Live data synchronization

## 🔒 Security Features

- **Row Level Security** (RLS) enabled on all tables
- **JWT Authentication** with Supabase
- **API Authentication** middleware
- **Input Validation** on all endpoints
- **CORS Configuration** for secure cross-origin requests

## 📧 Email Integration

The application uses Gmail SMTP for:
- Welcome emails for new users
- Task assignment notifications
- Meeting summary emails
- Custom notifications

### Gmail Setup
1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password for the application
3. Use the App Password in the GMAIL_PASS environment variable

## 🤖 AI Features

The CrewAI agent provides:
- **Transcript Analysis** - Extract key points and action items
- **Task Generation** - Automatically create tasks from meetings
- **Participant Analysis** - Identify speakers and contributions
- **Email Generation** - Create meeting summaries and follow-ups

## 🐳 Docker Deployment

The application includes complete Docker configuration:

### Dockerfile Features
- Multi-stage build for optimization
- Node.js and Python runtime
- Production-ready configuration
- Health checks included

### Docker Compose Services
- **frontend** - React application (Nginx)
- **backend** - Node.js API server
- **ai-agent** - Python CrewAI service

## 🔍 Troubleshooting

### Common Issues

1. **Database Connection**: Ensure Supabase URL and key are correct
2. **Authentication**: Check if RLS policies are properly configured
3. **File Upload**: Verify uploads directory permissions
4. **Email Sending**: Confirm Gmail App Password is correct
5. **AI Agent**: Ensure OpenAI API key is valid

### Development Tips

1. **Database Schema**: Run the enhancement SQL script completely
2. **Environment Variables**: Double-check all required variables
3. **CORS Issues**: Ensure frontend URL is in CORS configuration
4. **API Testing**: Use the provided endpoints for testing

## 📈 Performance Optimization

- **Database Indexing** - All tables have optimized indexes
- **API Pagination** - Large datasets are paginated
- **Image Optimization** - Profile images are optimized
- **Caching** - Static assets are cached
- **Bundle Splitting** - Frontend code is split for faster loading

## 🚀 Deployment Options

### Cloud Platforms
- **Vercel** - Frontend deployment
- **Railway/Render** - Backend deployment
- **Supabase** - Database hosting
- **Docker Hub** - Container registry

### Self-Hosted
- Use Docker Compose for complete stack deployment
- Configure reverse proxy (Nginx) for production
- Set up SSL certificates for HTTPS

## 📝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Review the API documentation

---

## 🎯 Next Steps

1. **Install Dependencies**: Follow the installation guide
2. **Configure Environment**: Set up all environment variables
3. **Run Database Script**: Execute the database enhancement SQL
4. **Start Services**: Run backend, frontend, and AI agent
5. **Test Application**: Create an account and upload a meeting transcript

Enjoy your modern Meeting Assistant SaaS application! 🎉