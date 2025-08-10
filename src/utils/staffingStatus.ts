import type { ShiftOccurrence, StaffMember, Trait } from "../storage/database";
import { ConstraintEngine, type ConstraintContext } from './constraints';
import type { TFunction } from 'i18next';

export interface StaffingStatus {
  status: 'properly-staffed' | 'understaffed' | 'overstaffed' | 'not-staffed' | 'constraint-violation';
  color: 'green' | 'orange' | 'red';
  message: string;
  missingTraits?: Array<{
    traitName: string;
    required: number;
    assigned: number;
  }>;
  constraintViolations?: Array<{
    staffMemberName: string;
    violationType: 'incompatible-staff' | 'blocked-time' | 'shift-count';
    violationMessage: string;
  }>;
}



export function calculateStaffingStatus(
  occurrence: ShiftOccurrence,
  assignedStaff: StaffMember[],
  allTraits: Trait[],
  t: TFunction,
  language: string,
  allShiftOccurrences?: ShiftOccurrence[],
  allStaff?: StaffMember[]
): StaffingStatus {
  const { requirements } = occurrence;
  const totalAssigned = assignedStaff.length;
  const totalRequired = requirements.staffCount;

  // Create a map of trait IDs to trait names for easy lookup
  const traitMap = new Map(allTraits.map(trait => [trait.id, trait.name]));

  // If no staff assigned at all
  if (totalAssigned === 0) {
    const message = t 
      ? t('staffing.notStaffed', { 
          count: totalRequired, 
          count_plural: totalRequired === 1 ? t('staffing.person') : t('staffing.people') 
        })
      : `This shift is not staffed (needs ${totalRequired} ${totalRequired === 1 ? 'person' : 'people'})`;
    
    return {
      status: 'not-staffed',
      color: 'red',
      message
    };
  }

  // Check trait requirements if they exist
  const missingTraits: Array<{ traitName: string; required: number; assigned: number }> = [];
  
  if (requirements.requiredTraits) {
    for (const requiredTrait of requirements.requiredTraits) {
      const staffWithTrait = assignedStaff.filter(staff => 
        staff.traitIds.includes(requiredTrait.traitId)
      );
      
      if (staffWithTrait.length < requiredTrait.minCount) {
        const traitName = traitMap.get(requiredTrait.traitId) || 'Unknown Trait';
        missingTraits.push({
          traitName,
          required: requiredTrait.minCount,
          assigned: staffWithTrait.length
        });
      }
    }
  }

  // If there are missing traits
  if (missingTraits.length > 0) {
    const missingTraitMessages = missingTraits.map(mt => 
      t ? t('staffing.missingTraitCount', { count: mt.required - mt.assigned, trait: mt.traitName })
        : `${mt.required - mt.assigned} more with ${mt.traitName}`
    );
    
    const message = t 
      ? t('staffing.missingTraits', { traits: missingTraitMessages.join(', ') })
      : `This shift is missing: ${missingTraitMessages.join(', ')}`;
    
    return {
      status: 'understaffed',
      color: 'orange',
      message,
      missingTraits
    };
  }

  // Check constraint violations using centralized constraint engine
  if (allShiftOccurrences && allStaff) {
    const constraintEngine = new ConstraintEngine();
    const allConstraintViolations: Array<{
      staffMemberName: string;
      violationType: 'incompatible-staff' | 'blocked-time' | 'shift-count';
      violationMessage: string;
    }> = [];
    
    // Check constraints for each assigned staff member
    for (const staffMember of assignedStaff) {
     
      const context: ConstraintContext = {
        targetStaff: staffMember,
        targetOccurrence: occurrence,
        allStaff: allStaff,
        allOccurrences: allShiftOccurrences,
        evaluationDate: new Date(occurrence.startDateTime),
        t: t,
        language,
        mode: 'validate_existing'  // Check if current assignments violate constraints
      };
      
      const violations = constraintEngine.validateStaffAssignment(context);
      const errorViolations = violations.filter(v => v.severity === 'error' || v.severity === 'warning');
      
      // Map constraint violations to the expected format
      for (const violation of errorViolations) {
        allConstraintViolations.push({
          staffMemberName: staffMember.name,
          violationType: 'blocked-time' as const,  // Simplified for compatibility
          violationMessage: violation.message
        });
      }
    }

    // If there are constraint violations, prioritize them
    if (allConstraintViolations.length > 0) {
      const message = t 
        ? t('staffing.constraintViolation')
        : 'This shift violates staff constraints';
     
      return {
        status: 'constraint-violation',
        color: 'red',
        message,
        constraintViolations: allConstraintViolations
      };
    }
  }

  // Check overall staffing levels
  if (totalAssigned < totalRequired) {
    const missing = totalRequired - totalAssigned;
    const message = t 
      ? t('staffing.understaffed', { 
          assigned: totalAssigned, 
          required: totalRequired, 
          missing, 
          missing_plural: missing === 1 ? t('staffing.person') : t('staffing.people') 
        })
      : `This shift is understaffed (${totalAssigned}/${totalRequired}, missing ${missing} ${missing === 1 ? 'person' : 'people'})`;
    
    return {
      status: 'understaffed',
      color: 'orange',
      message
    };
  } else if (totalAssigned > totalRequired) {
    const extra = totalAssigned - totalRequired;
    const message = t 
      ? t('staffing.overstaffed', { 
          assigned: totalAssigned, 
          required: totalRequired, 
          extra, 
          extra_plural: extra === 1 ? t('staffing.person') : t('staffing.people') 
        })
      : `This shift is overstaffed (${totalAssigned}/${totalRequired}, ${extra} extra ${extra === 1 ? 'person' : 'people'})`;
    
    return {
      status: 'overstaffed',
      color: 'orange',
      message
    };
  } else {
    const message = t 
      ? t('staffing.properlyStaffed')
      : 'This shift is properly staffed';
    
    return {
      status: 'properly-staffed',
      color: 'green',
      message
    };
  }
}