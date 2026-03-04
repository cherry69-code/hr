import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login.component';
import { ResetPasswordComponent } from './auth/reset-password.component';
import { LayoutComponent } from './core/layout/layout.component';
import { DashboardHomeComponent } from './dashboard/dashboard-home.component';
import { EmployeeHomeComponent } from './employee-home/employee-home.component';
import { AttendancePageComponent } from './attendance/attendance-page.component';
import { EmployeeListComponent } from './employees/employee-list.component';
import { LeavePageComponent } from './leaves/leave-page.component';
import { PayrollPageComponent } from './payroll/payroll-page.component';
import { DocumentPageComponent } from './documents/document-page.component';
import { LocationsPageComponent } from './locations/locations-page.component';
import { IncentiveDashboardComponent } from './incentives/incentive-dashboard.component';
import { IncentiveRuleBuilderComponent } from './incentives/incentive-rule-builder.component';
import { IncentiveAnalyticsComponent } from './incentives/incentive-analytics.component';
import { authGuard } from './guards/auth.guard';
import { inject } from '@angular/core';
import { AuthService } from './services/auth.service';

const RoleRedirectGuard = () => {
  const authService = inject(AuthService);
  const role = authService.getRole();
  return role === 'employee' ? '/home' : '/dashboard';
};

import { ProfileComponent } from './profile/profile.component';
import { DepartmentListComponent } from './departments/department-list.component';
import { OfferLetterPageComponent } from './offer-letter/offer-letter-page.component';
import { TemplatesPageComponent } from './templates/templates-page.component';
import { HrDocumentsPageComponent } from './hr-documents/hr-documents-page.component';
import { EsignPublicComponent } from './esign/esign-public.component';
import { MyDocumentsPageComponent } from './my-documents/my-documents-page.component';
import { JoiningAgreementPageComponent } from './joining-agreement/joining-agreement-page.component';

export const routes: Routes = [
  { path: 'auth/login', component: LoginComponent },
  { path: 'auth/reset-password/:token', component: ResetPasswordComponent },
  { path: 'esign/:token', component: EsignPublicComponent },
  { path: 'sign/:token', component: EsignPublicComponent },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'home', component: EmployeeHomeComponent },
      { path: 'dashboard', component: DashboardHomeComponent },
      { path: 'profile', component: ProfileComponent },
      { path: 'profile/:id', component: ProfileComponent },
      { path: 'attendance', component: AttendancePageComponent },
      { path: 'employees', component: EmployeeListComponent, data: { roles: ['admin', 'hr', 'manager'] } },
      { path: 'departments', component: DepartmentListComponent, data: { roles: ['admin'] } },
      { path: 'leaves', component: LeavePageComponent },
      { path: 'payroll', component: PayrollPageComponent },
      { path: 'incentives', component: IncentiveDashboardComponent },
      { path: 'incentives/rules', component: IncentiveRuleBuilderComponent, data: { roles: ['admin', 'hr'] } },
      { path: 'incentives/analytics', component: IncentiveAnalyticsComponent, data: { roles: ['admin', 'hr'] } },
      { path: 'locations', component: LocationsPageComponent, data: { roles: ['admin', 'hr'] } },
      { path: 'documents', component: DocumentPageComponent },
      { path: 'offer-letter', component: OfferLetterPageComponent, data: { roles: ['admin', 'hr'] } },
      { path: 'joining-agreement', component: JoiningAgreementPageComponent, data: { roles: ['admin', 'hr'] } },
      { path: 'templates', component: TemplatesPageComponent, data: { roles: ['admin'] } },
      { path: 'hr-documents', component: HrDocumentsPageComponent, data: { roles: ['admin', 'hr'] } },
      { path: 'my-documents', component: MyDocumentsPageComponent, data: { roles: ['admin', 'hr', 'employee', 'manager'] } },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' } // Default fallback
    ]
  },
  { path: '**', redirectTo: 'auth/login' }
];
