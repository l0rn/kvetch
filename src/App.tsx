import { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Database } from './storage/database';
import { useAppConfig } from './config/AppConfig';
import { useAuth } from './auth/AuthContext';
import type { Shift, StaffMember, ShiftOccurrence, Trait, StaffDoc, TraitDoc, ShiftDoc } from './storage/database';
import { generateShiftOccurrences } from './utils/recurrence';
import { ConstraintEngine, type ConstraintContext } from './utils/constraints';
import { ShiftsView } from './components/views/ShiftsView';
import { StaffView } from './components/views/StaffView';
import { WeeklyPlanningView } from './components/views/WeeklyPlanningView';
import { UserManagementView } from './components/views/UserManagementView';
import { UserSettingsView } from './components/views/UserSettingsView';
import { EmailVerificationView } from './components/views/EmailVerificationView';
import { StaffBlockedTimeCalendar } from './components/views/StaffBlockedTimeCalendar';
import { ShiftOccurrenceForm } from './components/forms/ShiftOccurrenceForm';
import { Modal } from './components/Modal';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { HamburgerMenu } from './components/HamburgerMenu';
import { DataManagement } from './components/DataManagement';
import { ToastContainer } from './components/Toast';
import { useToast } from './hooks/useToast';
import './i18n';
import './App.css';
import './styles/auth.css';
import './styles/settings.css';
import { setDefaultOptions } from 'date-fns';

function App() {
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const { toasts, removeToast, addToast } = useToast();
  const { isFeatureEnabled } = useAppConfig();
  const { user } = useAuth();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shiftOccurrences, setShiftOccurrences] = useState<ShiftOccurrence[]>([]);
  const [allTraits, setAllTraits] = useState<Trait[]>([]);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [showOccurrenceForm, setShowOccurrenceForm] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [editingOccurrence, setEditingOccurrence] = useState<ShiftOccurrence | null>(null);

  const language= i18n.language || 'en';
  
  setDefaultOptions({ weekStartsOn: 1 }); // Set Monday as the first day of the week

  // Load initial data
  useEffect(() => {
    Database.getShifts().then(setShifts);
    Database.getStaffMembers().then(setStaff);
    Database.getTraits().then(setAllTraits);
  }, []);

  // Live updates for all data types
  useEffect(() => {
    const staffListener = Database.liveGetStaffMembers((change: PouchDB.Core.ChangesResponseChange<StaffDoc>) => {
      if (change.deleted) {
        setStaff(prev => prev.filter(s => s.id !== change.id.replace('staff:', '')));
      } else if (change.doc) {
        const member = Database.docToStaffMember(change.doc);
        setStaff(prev => {
          const index = prev.findIndex(s => s.id === member.id);
          if (index > -1) {
            const newStaff = [...prev];
            newStaff[index] = member;
            return newStaff;
          }
          return [...prev, member];
        });
      }
    });

    const traitsListener = Database.liveGetTraits((change: PouchDB.Core.ChangesResponseChange<TraitDoc>) => {
      if (change.deleted) {
        setAllTraits(prev => prev.filter(t => t.id !== change.id.replace('trait:', '')));
      } else if (change.doc) {
        const newTrait = Database.docToTrait(change.doc);
        setAllTraits(prev => {
          const index = prev.findIndex(t => t.id === newTrait.id);
          if (index > -1) {
            const newTraits = [...prev];
            newTraits[index] = newTrait;
            return newTraits;
          }
          return [...prev, newTrait].sort((a, b) => a.name.localeCompare(b.name));
        });
      }
    });

    const shiftsListener = Database.liveGetShifts((change: PouchDB.Core.ChangesResponseChange<ShiftDoc>) => {
      if (change.deleted) {
        setShifts(prev => prev.filter(s => s.id !== change.id.replace('shift:', '')));
      } else if (change.doc) {
        const newShift = Database.docToShift(change.doc);
        setShifts(prev => {
          const index = prev.findIndex(s => s.id === newShift.id);
          if (index > -1) {
            const newShifts = [...prev];
            newShifts[index] = newShift;
            return newShifts;
          }
          return [...prev, newShift];
        });
      }
    });

    return () => {
      staffListener.cancel();
      traitsListener.cancel();
      shiftsListener.cancel();
    };
  }, []);

  // Recalculate shift occurrences whenever shifts or stored occurrences change
  useEffect(() => {
    const generatedOccurrences = shifts.flatMap(shift => generateShiftOccurrences(shift));
    
    Database.getShiftOccurrences().then(storedOccurrences => {
      const storedOccurrenceMap = new Map(storedOccurrences.map(occ => [occ.id, occ]));
      const finalOccurrences = generatedOccurrences.map(generated => {
        const stored = storedOccurrenceMap.get(generated.id);
        return stored || generated;
      }).filter(occ => !occ.isDeleted);
      setShiftOccurrences(finalOccurrences);
    });

    // Also listen for live changes to stored occurrences
    const occurrencesListener = Database.liveGetShiftOccurrences(() => {
      // This will trigger a re-fetch and merge of occurrences
      Database.getShiftOccurrences().then(storedOccurrences => {
        const storedOccurrenceMap = new Map(storedOccurrences.map(occ => [occ.id, occ]));
        const finalOccurrences = shifts.flatMap(shift => generateShiftOccurrences(shift)).map(generated => {
          const stored = storedOccurrenceMap.get(generated.id);
          return stored || generated;
        }).filter(occ => !occ.isDeleted);
        setShiftOccurrences(finalOccurrences);
      });
    });

    return () => {
      occurrencesListener.cancel();
    };

  }, [shifts]); // Dependency on shifts is key

  const handleSaveShift = async (shiftData: Partial<Shift>, isDestructive: boolean = false) => {
    const newShift: Shift = {
      ...shiftData,
      id: editingShift?.id || `${shiftData.name}-${new Date(shiftData.startDateTime!).getTime()}`,
    } as Shift;
    // If this is a destructive change, delete all existing occurrences first
    if (isDestructive && editingShift?.id) {
      await Database.deleteShiftOccurrencesByParent(editingShift.id);
    }
    await Database.saveShift(newShift);
    setShowShiftForm(false);
    setEditingShift(null);
  };

  const handleEditShift = (shift: Shift) => {
    setEditingShift(shift);
    setShowShiftForm(true);
  };

  const handleDeleteShift = async (shiftId: string) => {
    await Database.deleteShift(shiftId);
    await Database.deleteShiftOccurrencesByParent(shiftId);
  };

  const handleSaveStaff = async (staffData: Omit<StaffMember, 'id'>) => {
    const newStaff: StaffMember = {
      ...staffData,
      id: editingStaff?.id || Date.now().toString(),
    };
    
    await Database.saveStaffMember(newStaff);
    setShowStaffForm(false);
    setEditingStaff(null);
  };

  const handleEditStaff = (staff: StaffMember) => {
    setEditingStaff(staff);
    setShowStaffForm(true);
  };

  const handleDeleteStaff = async (staffId: string) => {
    await Database.deleteStaffMember(staffId);
  };

  const handleSaveOccurrence = async (occurrence: ShiftOccurrence) => {
    await Database.saveShiftOccurrence(occurrence);
    setShowOccurrenceForm(false);
    setEditingOccurrence(null);
  };

  const handleAssignStaffToShift = async (occurrenceId: string, staffId: string) => {
    const occurrence = shiftOccurrences.find(occ => occ.id === occurrenceId);
    const staffMember = staff.find(s => s.id === staffId);
    
    if (occurrence && staffMember && !occurrence.assignedStaff.includes(staffId)) {
      // Create temporary assignment for validation
      const tempAssignments: { [occurrenceId: string]: string[] } = {};
      shiftOccurrences.forEach(occ => {
        tempAssignments[occ.id] = occ.id === occurrenceId 
          ? [...occ.assignedStaff, staffId]
          : occ.assignedStaff;
      });

      // Validate constraints
      const constraintEngine = new ConstraintEngine();
      const context: ConstraintContext = {
        targetStaff: staffMember,
        targetOccurrence: occurrence,
        allStaff: staff,
        allOccurrences: shiftOccurrences,
        evaluationDate: new Date(occurrence.startDateTime),
        t,
        language,
        mode: 'check_assignment'  // Check if adding this assignment would violate constraints
      };
      const violations = constraintEngine.validateStaffAssignment(context);

      // Always proceed with assignment, but show warnings for violations
      const allViolations = violations.filter(v => v.severity === 'error' || v.severity === 'warning');
      if (allViolations.length > 0) {
        const violationMessages = allViolations.map(v => v.message);
        addToast(
          'warning',
          `${t('planning.constraintWarning', 'Constraint warning')}`,
          `• ${violationMessages.slice(0, 5).join('\n• ')}${violationMessages.length > 5 ? `\n• +${violationMessages.length - 5} more...` : ''}`);
      }

      // Proceed with assignment regardless of constraints
      const updatedOccurrence = {
        ...occurrence,
        assignedStaff: [...occurrence.assignedStaff, staffId],
        isModified: true
      };
      await Database.saveShiftOccurrence(updatedOccurrence);
    }
  };

  const handleUnassignStaffFromShift = async (occurrenceId: string, staffId: string) => {
    const occurrence = shiftOccurrences.find(occ => occ.id === occurrenceId);
    if (occurrence && occurrence.assignedStaff.includes(staffId)) {
      const updatedOccurrence = {
        ...occurrence,
        assignedStaff: occurrence.assignedStaff.filter(id => id !== staffId),
        isModified: true
      };
      await Database.saveShiftOccurrence(updatedOccurrence);
    }
  };

  const handleUpdateShiftOccurrences = async (updatedOccurrences: { [occurrenceId: string]: string[] }) => {
    const updates = [];
    
    for (const [occurrenceId, assignedStaff] of Object.entries(updatedOccurrences)) {
      const occurrence = shiftOccurrences.find(occ => occ.id === occurrenceId);
      if (occurrence) {
        // Only update if assignments actually changed
        const currentStaff = [...occurrence.assignedStaff].sort();
        const newStaff = [...assignedStaff].sort();
        
        if (currentStaff.join(',') !== newStaff.join(',')) {
          const updatedOccurrence = {
            ...occurrence,
            assignedStaff,
            isModified: true
          };
          updates.push(Database.saveShiftOccurrence(updatedOccurrence));
        }
      }
    }
    if (updates.length > 0) {
      await Promise.all(updates);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-container">
          <div className="brand-section">
            <h1 className="brand-title">Kvetch</h1>
            <span className="brand-subtitle">Shift Planning</span>
          </div>
          
          <nav className="main-nav">
            <Link 
              to="/shifts"
              className={`nav-link ${location.pathname === '/shifts' ? 'active' : ''}`}
            >
              {t('navigation.shifts')}
            </Link>
            <Link 
              to="/staff"
              className={`nav-link ${location.pathname === '/staff' ? 'active' : ''}`}
            >
              {t('navigation.staff')}
            </Link>
            <Link
              to="/planning"
              className={`nav-link ${location.pathname.startsWith('/planning') ? 'active' : ''}`}
            >
              {t('navigation.planning')}
            </Link>
            <Link
              to="/calendar"
              className={`nav-link ${location.pathname === '/calendar' ? 'active' : ''}`}
            >
              {t('navigation.calendar')}
            </Link>
            {isFeatureEnabled('userManagement') && (user?.role === 'admin' || user?.role === 'instance-admin' || user?.role === 'instance-manager') && (
              <Link 
                to="/users"
                className={`nav-link ${location.pathname === '/users' ? 'active' : ''}`}
              >
                {t('navigation.users', 'Users')}
              </Link>
            )}
            {user && (
              <Link 
                to="/settings"
                className={`nav-link ${location.pathname === '/settings' ? 'active' : ''}`}
              >
                {t('navigation.settings', 'Settings')}
              </Link>
            )}
          </nav>
          
          <div className="header-actions">
            <DataManagement onShowToast={addToast} />
            <LanguageSwitcher />
            <HamburgerMenu
              onLanguageChange={i18n.changeLanguage}
              currentLanguage={i18n.language}
              onShowToast={addToast}
            />
          </div>
        </div>
      </header>

      <main className="app-main">        
        <Routes>
          <Route path="/" element={<Navigate to="/planning" replace />} />
          <Route 
            path="/shifts" 
            element={
              <ShiftsView
                shifts={shifts}
                shiftOccurrences={shiftOccurrences}
                showShiftForm={showShiftForm}
                editingShift={editingShift}
                onShowShiftForm={() => setShowShiftForm(true)}
                onSaveShift={handleSaveShift}
                onEditShift={handleEditShift}
                onDeleteShift={handleDeleteShift}
                onCancelShiftForm={() => {
                  setShowShiftForm(false);
                  setEditingShift(null);
                }}
              />
            } 
          />
          <Route 
            path="/staff" 
            element={
              <StaffView
                staff={staff}
                showStaffForm={showStaffForm}
                editingStaff={editingStaff}
                onShowStaffForm={() => setShowStaffForm(true)}
                onSaveStaff={handleSaveStaff}
                onEditStaff={handleEditStaff}
                onDeleteStaff={handleDeleteStaff}
                onCancelStaffForm={() => {
                  setShowStaffForm(false);
                  setEditingStaff(null);
                }}
              />
            } 
          />
          <Route 
            path="/planning" 
            element={<Navigate to={`/planning/${new Date().toISOString().split('T')[0]}`} replace />} 
          />
          <Route
            path="/planning/:weekStr"
            element={
              <WeeklyPlanningView
                shiftOccurrences={shiftOccurrences}
                staff={staff}
                allTraits={allTraits}
                onAssignStaffToShift={handleAssignStaffToShift}
                onUnassignStaffFromShift={handleUnassignStaffFromShift}
                onUpdateShiftOccurrences={handleUpdateShiftOccurrences}
                onShowToast={addToast}
                onEditOccurrence={(occurrence) => {
                  setEditingOccurrence(occurrence);
                  setShowOccurrenceForm(true);
                }}
              />
            }
          />
          <Route
            path="/calendar"
            element={<StaffBlockedTimeCalendar />}
          />
          {isFeatureEnabled('userManagement') && (
            <Route 
              path="/users" 
              element={<UserManagementView />} 
            />
          )}
          <Route 
            path="/settings" 
            element={<UserSettingsView />} 
          />
          <Route 
            path="/verify-email" 
            element={<EmailVerificationView />} 
          />
        </Routes>
        
        {/* Occurrence Edit Modal */}
        <Modal
          isOpen={showOccurrenceForm}
          onClose={() => {
            setShowOccurrenceForm(false);
            setEditingOccurrence(null);
          }}
          title={`Edit Occurrence - ${editingOccurrence ? new Date(editingOccurrence.startDateTime).toLocaleDateString(i18n.language) : ''}`}
        >
          {editingOccurrence && (
            <ShiftOccurrenceForm
              occurrence={editingOccurrence}
              onSave={handleSaveOccurrence}
              onCancel={() => {
                setShowOccurrenceForm(false);
                setEditingOccurrence(null);
              }}
            />
          )}
        </Modal>
      </main>
      
      <ToastContainer messages={toasts} onClose={removeToast} />
    </div>
  );
}

export default App;
