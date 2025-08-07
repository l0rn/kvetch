# Kvetch - Shift Planning Tool

An offline-first web application for shift planning that enables planning even with complex personal constraints for staff members.

## Features

### ✅ Core Functionality

- **Shift Management**: Create, edit, and delete shifts with recurrence patterns
- **Staff Management**: Manage staff members with traits, constraints, and blocked times
- **Weekly Planning View**: Visual shift planning with drag-and-drop staff assignment
- **Auto-scheduling**: Intelligent staff assignment based on requirements and constraints
- **Offline Support**: Works without internet connection using browser storage
- **Multi-language**: Support for English and German
- **Print-friendly**: Optimized print view for shift schedules

### 📱 Responsive Design

- **Mobile-first**: Fully responsive design across all screen sizes
- **Hamburger Menu**: Collapsible navigation for mobile devices
- **Touch-friendly**: Optimized for touch interactions
- **Print Support**: Clean print layouts for shift schedules

### 🔧 Technical Features

- **PWA Ready**: Progressive Web App with offline capabilities
- **Real-time Updates**: Instant synchronization across browser tabs
- **Data Persistence**: Reliable browser-based storage
- **Modern UI**: Clean, intuitive interface following design principles

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn package manager

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd kvetch
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Start development server**

   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:5174`

4. **Build for production**

   ```bash
   npm run build
   ```

   Built files will be in the `dist` directory

### Development Commands

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build production version
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint for code quality checks

## Project Structure

```text
src/
├── components/          # Reusable UI components
│   ├── forms/          # Form components (ShiftForm, StaffForm, etc.)
│   ├── views/          # Page components (ShiftsView, WeeklyPlanningView, etc.)
│   └── ...             # Modal, Toast, Navigation components
├── storage/            # Data persistence layer
├── utils/              # Utility functions (scheduling, validation, etc.)
├── i18n/               # Internationalization files
└── App.tsx             # Main application component
```

## Usage Guide

### Creating Shifts

1. Navigate to the "Shifts" tab
2. Click "Add New Shift"
3. Fill in shift details:
   - Name, date, start/end time
   - Staff requirements and trait requirements
   - Recurrence patterns (daily, weekly, monthly)

### Managing Staff

1. Navigate to the "Staff" tab
2. Click "Add New Staff Member"
3. Configure:
   - Personal information and traits/skills
   - Shift constraints (max per day/week/month/year)
   - Incompatible colleagues
   - Blocked times/personal calendar

### Weekly Planning

1. Navigate to the "Planning" tab
2. Use week navigation to select desired week
3. **Drag and drop** staff members onto shift cells
4. Use **Auto-schedule** for intelligent assignment
5. Click shifts to edit individual occurrences
6. **Print** for physical schedules

### Key Features

- **Weekend Toggle**: Show/hide weekend shifts
- **Auto-scheduling**: Respects all constraints and requirements
- **Constraint Violations**: Visual indicators for scheduling conflicts
- **Print Mode**: Clean, professional printing layout

## Deployment

### GitHub Pages

A GitHub Actions workflow is configured for automatic deployment:

1. Push changes to the `main` branch
2. GitHub Actions will build and deploy automatically
3. Access at: `https://yourusername.github.io/`

### Manual Deployment

1. Run `npm run build`
2. Deploy the `dist` folder to your hosting service
3. Ensure proper base path configuration for subdirectory hosting

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Storage**: LocalForage (IndexedDB/WebSQL/LocalStorage)
- **Calendar**: React Big Calendar
- **Styling**: CSS with responsive design
- **Build**: Vite with PWA plugin
- **i18n**: react-i18next

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a pull request

## License

This project is open source and available under the MIT License.
