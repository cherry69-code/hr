# PropHR - Complete HR Management System

PropHR is a production-ready Human Resource Management System built with Angular 17, Node.js, and MongoDB.

## Architecture (Monolith)
The system is built with a standard monolithic architecture for simplicity and ease of deployment:

- **Angular UI**: The frontend application.
- **Node.js/Express Backend**: A single server handling authentication, employee management, payroll, and more.

## Tech Stack
- **Frontend**: Angular 17+, Tailwind CSS
- **Backend**: Node.js, Express.js
- **Database**: MongoDB Cluster (Atlas)
- **Auth**: JWT & Bcrypt
- **Storage**: Cloudinary

## Setup Instructions

### Prerequisites
- Node.js (v18+)
- MongoDB (Local or Atlas)
- Cloudinary Account

### Backend Setup
1. Navigate to `backend/`.
2. Install dependencies: `npm install`.
3. Configure the `.env` file with your credentials (MongoDB, JWT, Cloudinary).
4. Start the server: `npm start` or `npm run dev`.

### Frontend Setup
1. Navigate to `frontend/`.
2. Install dependencies: `npm install`.
3. Start the application: `npm start`.
4. Access at `http://localhost:4200`.

## API Documentation
All endpoints are prefixed with `/api`:
- `/api/auth`: Authentication routes
- `/api/employees`: Employee management
- `/api/leaves`: Leave management
- `/api/dashboard`: Dashboard statistics
- `/api/departments`: Department management
- `/api/payroll`: Payroll and Salary management
- `/api/documents`: Document and PDF management
- `/api/attendance`: Geolocation attendance management

## Deployment (Render + MongoDB Atlas)
1. Push code to GitHub.
2. Create a new Web Service on Render for the backend.
3. Set environment variables on Render.
4. Create a new Static Site on Render for the frontend.
5. Point frontend API URL to Render backend URL.
6. Connect MongoDB Atlas to Render backend via `MONGO_URI`.

## License
MIT
