# Kvetch

This is going to be an offline-first web tool for shift planning enabling planning
even with complex personal constraints for the staff.

## Agent instructions

- Save conversation context frequently so that if the code claude cli crashes it's easy to resume a thread
- Periodically search for duplication of functionality and refactor if it makes sense
- Find a way to start the application and evaluate the quality and usability of the tool based on the result (via screenshot if necessary)
- When starting development servers do explicitly run them in background to avoid stalling the converstation

## Technical stuff

- The application should run in a browser
- The application should be offline-first and usable without a backend service
- The application should store any state in a browser available, persistent storage
- The application should use a popular ui/ux framework and follow common design principles that should feel familiar
- The application will make use of typical calendar features (see below). There is no need to re-invent the wheel, if the required calender functionality is available as library it is welcomed.

Below sections describe the features of the tool.

## Creating shifts

A manager can create shifts. A shift is much like an entry in calendar software.
It needs to have a name, a start time, an end time, a date and potentially a rythm of re-occurence.
Like calendar entries a manager may delete or edit a single item of a re-occuring shift.

A shift can have an arbitrary amount of requirements like:

- Number of staff
- A minimum number of staff with a certain trait (see staff member feature)

## Creating staff members

A manager can create staff members. A staff member can have traits which are essentially tags and may influence their
schedulability on shifts.
A staff member can also have other constraints, like:

- Multiple maximum shifts per (week / month / year) constraints
- A list of other staff members they _cannot_ be scheduled on the same shift with
- A personal calender where "blocked" time can be entered where this person is unschedulable. Those entries should also behave like calender entries, with either "start time" and "end time" or "full day" and possibly re-occurence and the option to edit and delete single items of a re-occurence.

## Shift calender view

There needs to be a view where a weekly shift table is displayed including the scheduled staff on each shift.
The table should be print friendly.

# Implementation Status (2025-08-07)

## ✅ COMPLETED FEATURES

### Core Application Features
- ✅ **Shift Management**: Complete CRUD operations with recurrence patterns (daily/weekly/monthly)
- ✅ **Staff Management**: Full staff lifecycle with traits, constraints, and blocked times
- ✅ **Weekly Planning View**: Drag-and-drop staff assignment with visual scheduling
- ✅ **Auto-scheduling**: Intelligent staff assignment respecting all constraints
- ✅ **Data Persistence**: Offline-first with LocalForage (IndexedDB/WebSQL/LocalStorage)
- ✅ **Internationalization**: English and German language support
- ✅ **Print Functionality**: Professional print layouts for shift schedules

### Advanced Scheduling Features
- ✅ **Recurring Shift Occurrences**: Individual shift instances with modification support
- ✅ **Constraint Management**: Daily/weekly/monthly/yearly limits with violation detection
- ✅ **Staff Scheduling**: Assignment/unassignment with conflict prevention
- ✅ **Trait Requirements**: Skills-based shift requirements and matching
- ✅ **Incompatible Staff**: Prevent scheduling conflicting staff together
- ✅ **Blocked Times**: Personal calendar integration for staff availability

### User Interface & Experience  
- ✅ **Responsive Design**: Mobile-first responsive layout across all breakpoints
- ✅ **Mobile Navigation**: Hamburger menu for screens < 480px
- ✅ **Touch Interactions**: Optimized for mobile drag-and-drop
- ✅ **Modal System**: Mobile-responsive modals (full-screen on mobile)
- ✅ **Toast Notifications**: User feedback system with multi-language support
- ✅ **Weekend Toggle**: Show/hide weekend shifts in planning view

### Technical Infrastructure
- ✅ **PWA Ready**: Progressive Web App with offline capabilities
- ✅ **Database Architecture**: ShiftOccurrence model for individual scheduling
- ✅ **GitHub Actions**: Automated build and deployment to GitHub Pages
- ✅ **TypeScript**: Full type safety throughout application
- ✅ **Modern Build System**: Vite with hot reload and optimization

## 📱 RESPONSIVE DESIGN IMPLEMENTATION

### Breakpoints & Layout
- ✅ **Mobile (≤480px)**: Hamburger navigation, full-screen modals, stacked layouts
- ✅ **Tablet (≤768px)**: Flexible layouts, horizontal staff scrolling
- ✅ **Desktop (≤1024px)**: Optimized table layouts and navigation
- ✅ **Large Screens (≤1400px)**: Header reorganization for planning view

### Mobile Optimizations
- ✅ **Planning View**: Responsive table with mobile-friendly controls
- ✅ **Staff Panel**: Horizontal scrolling staff members on mobile
- ✅ **Navigation**: Collapsible hamburger menu with language switching
- ✅ **Modals**: Full-screen experience on mobile devices

## 🏗️ ARCHITECTURE

### Core Components
- **App.tsx**: Main application with routing and state management
- **WeeklyPlanningView.tsx**: Primary scheduling interface
- **Database (PouchDB)**: Offline-first data persistence layer
- **Auto-scheduler**: Constraint-aware staff assignment algorithm
- **Responsive CSS**: Mobile-first responsive design system

### Data Flow
1. **Shifts** → **ShiftOccurrences** (generated instances)
2. **Staff** → **Constraints** → **Scheduling Logic**
3. **Drag & Drop** → **Assignment** → **Database** → **UI Update**

## 🚀 DEPLOYMENT

### GitHub Pages Integration
- ✅ **Automated CI/CD**: GitHub Actions workflow for build and deployment
- ✅ **Base Path Configuration**: Proper routing for subdirectory hosting
- ✅ **Production Build**: Optimized Vite build with PWA assets

### Development Environment
- **Dev Server**: `npm run dev` (http://localhost:5174)
- **Build**: `npm run build` 
- **Preview**: `npm run preview`
- **Lint**: ESLint configuration for code quality

## 🎯 FUTURE ENHANCEMENTS

### Potential Improvements
1. **Advanced Analytics**: Shift coverage reports and staff utilization metrics
2. **Export Functionality**: CSV/PDF export for schedules and reports
3. **Notification System**: Shift reminders and schedule changes
4. **Multi-location Support**: Support for multiple venues/departments
5. **Advanced Constraints**: Time-based preferences, availability patterns

## 📋 CURRENT STATUS

### Project State: **PRODUCTION READY** 
- ✅ Core functionality complete and tested
- ✅ Responsive design implemented across all breakpoints  
- ✅ Offline-first architecture working
- ✅ Automated deployment configured
- ✅ Comprehensive documentation provided

### Testing Status
- ✅ Manual testing completed for core workflows
- ✅ Responsive behavior verified across breakpoints
- ✅ Mobile interactions tested and optimized
- ✅ Print functionality verified

### Ready for Use
The application is fully functional and ready for production use with:
- Complete shift and staff management
- Advanced scheduling with constraint handling
- Mobile-responsive design
- Offline capabilities
- Professional print output
