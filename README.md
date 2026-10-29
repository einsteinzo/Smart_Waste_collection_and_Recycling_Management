# WasteWise – Smart Waste Collection and Recycling Management Portal

## Project Overview

WasteWise is a web-based waste management application designed to connect citizens, waste collectors, recycling centers, and administrators through a centralized platform. It helps organize waste pickup requests, collection assignments, delivery tracking, and recycling records.

## Objectives

- Provide a centralized platform for waste collection and recycling management.
- Allow citizens to submit and track waste pickup requests.
- Help collectors manage assigned pickups and update collection statuses.
- Maintain recycling-center and waste-processing records.
- Provide role-based dashboards for different users.
- Demonstrate frontend, backend, database integration, and web security concepts.

## Main Modules

### 1. Citizen
- User registration and login.
- Submit waste pickup requests.
- Track pickup progress.

### 2. Waste Collector
- View assigned pickup requests.
- Update collection and delivery details.

### 3. Recycling Center
- Manage recycling-center information.
- Record received, rejected, and processed waste.

### 4. Administrator
- Manage users and pickup assignments.
- Oversee recycling facilities and system activity.

## Technology Stack

| Technology | Purpose |
|---|---|
| HTML5 | Webpage structure |
| CSS3 | Styling and layout |
| JavaScript | Frontend interactions |
| Bootstrap 5 | Responsive interface |
| Node.js | Server-side runtime |
| Express.js | Backend routes and APIs |
| MongoDB | Database |
| Mongoose | Database modelling and operations |
| bcryptjs | Password hashing |
| Express Session | Session management |

## Database

Database name: `wastewise`

Collections:
- `users`
- `pickups`
- `recyclingcenters`
- `recyclingrecords`
- `activitylogs`

## Application Workflow

1. A citizen submits a waste pickup request.
2. The backend validates the request and stores it in MongoDB.
3. An administrator assigns a collector.
4. The collector updates collection and delivery information.
5. The recycling-center manager records processing details.
6. The request progresses through its defined status workflow.

## Security Concepts

- Password hashing.
- Session-based authentication.
- Role-based authorization.
- Input validation.
- HTTP security headers.
- Rate limiting for selected endpoints.

## Installation and Execution

### Prerequisites
- Node.js and npm.
- MongoDB Server.

### Steps

1. Clone or download this repository.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure the required environment variables in a local `.env` file.
4. Ensure MongoDB is running and the database connection is configured.
5. Start the application:

   ```bash
   npm start
   ```

6. Open `http://localhost:5000` in your browser.

## Academic Information

**Course:** Web Technology  
**Course Code:** 23CS2048  
**Institution:** Karunya Institute of Technology and Sciences  
**Project:** WasteWise – Smart Waste Collection and Recycling Management Portal

## Future Enhancements

- GPS-based collection tracking.
- Pickup notifications.
- Interactive collection maps.
- Recycling analytics and reports.
- Secure cloud deployment.

---

*Developed as an academic Web Technology project.*
