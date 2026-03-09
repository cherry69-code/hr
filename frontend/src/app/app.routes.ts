import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login.component';
import { ResetPasswordComponent } from './auth/reset-password.component';
import { LayoutComponent } from './core/layout/layout.component';
import { authGuard } from './guards/auth.guard';
import { inject } from '@angular/core';
import { AuthService } from './services/auth.service';
import { EsignPublicComponent } from './esign/esign-public.component';

const RoleRedirectGuard = () => {
  const authService = inject(AuthService);
  const role = authService.getRole();
  return role === 'employee' ? '/home' : '/dashboard';
};

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
      {
        path: 'home',
        loadComponent: () => import('./employee-home/employee-home.component').then(m => m.EmployeeHomeComponent)
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./dashboard/dashboard-home.component').then(m => m.DashboardHomeComponent)
      },
      {
        path: 'profile',
        loadComponent: () => import('./profile/profile.component').then(m => m.ProfileComponent)
      },
      {
        path: 'profile/:id',
        loadComponent: () => import('./profile/profile.component').then(m => m.ProfileComponent)
      },
      {
        path: 'attendance',
        loadComponent: () => import('./attendance/attendance-page.component').then(m => m.AttendancePageComponent)
      },
      {
        path: 'attendance/adjustment',
        loadComponent: () => import('./attendance/attendance-adjustment.component').then(m => m.AttendanceAdjustmentComponent),
        data: { roles: ['admin', 'hr'] }
      },
      {
        path: 'employees',
        loadComponent: () => import('./employees/employee-list.component').then(m => m.EmployeeListComponent),
        data: { roles: ['admin', 'hr', 'manager'] }
      },
      {
        path: 'departments',
        loadComponent: () => import('./departments/department-list.component').then(m => m.DepartmentListComponent),
        data: { roles: ['admin'] }
      },
      {
        path: 'leaves',
        loadComponent: () => import('./leaves/leave-page.component').then(m => m.LeavePageComponent)
      },
      {
        path: 'payroll',
        loadComponent: () => import('./payroll/payroll-page.component').then(m => m.PayrollPageComponent)
      },
      {
        path: 'incentives',
        loadComponent: () => import('./incentives/incentive-dashboard.component').then(m => m.IncentiveDashboardComponent)
      },
      {
        path: 'incentives/rules',
        loadComponent: () => import('./incentives/incentive-rule-builder.component').then(m => m.IncentiveRuleBuilderComponent),
        data: { roles: ['admin', 'hr'] }
      },
      {
        path: 'incentives/analytics',
        loadComponent: () => import('./incentives/incentive-analytics.component').then(m => m.IncentiveAnalyticsComponent),
        data: { roles: ['admin', 'hr'] }
      },
      {
        path: 'locations',
        loadComponent: () => import('./locations/locations-page.component').then(m => m.LocationsPageComponent),
        data: { roles: ['admin', 'hr'] }
      },
      {
        path: 'documents',
        loadComponent: () => import('./documents/document-page.component').then(m => m.DocumentPageComponent)
      },
      {
        path: 'offer-letter',
        loadComponent: () => import('./offer-letter/offer-letter-page.component').then(m => m.OfferLetterPageComponent),
        data: { roles: ['admin', 'hr'] }
      },
      {
        path: 'joining-agreement',
        loadComponent: () => import('./joining-agreement/joining-agreement-page.component').then(m => m.JoiningAgreementPageComponent),
        data: { roles: ['admin', 'hr'] }
      },
      {
        path: 'templates',
        loadComponent: () => import('./templates/templates-page.component').then(m => m.TemplatesPageComponent),
        data: { roles: ['admin'] }
      },
      {
        path: 'hr-documents',
        loadComponent: () => import('./hr-documents/hr-documents-page.component').then(m => m.HrDocumentsPageComponent),
        data: { roles: ['admin', 'hr'] }
      },
      {
        path: 'my-documents',
        loadComponent: () => import('./my-documents/my-documents-page.component').then(m => m.MyDocumentsPageComponent),
        data: { roles: ['admin', 'hr', 'employee', 'manager'] }
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: 'auth/login' }
];
