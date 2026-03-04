import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-employee-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './employee-list.component.html'
})
export class EmployeeListComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private toast = inject(ToastService);

  employees: any[] = [];
  departments: any[] = [];
  managers: any[] = [];
  loading = false;
  showAddModal = false;
  isEditing = false;
  currentEmployeeId: string | null = null;

  newEmployee = {
    fullName: '',
    email: '',
    password: '',
    role: 'employee',
    level: 'N0',
    designation: '',
    departmentId: '',
    reportingManagerId: '',
    teamId: '',
    salary: { ctc: 0 },
    geofence: { latitude: 0, longitude: 0, radius: 500 }
  };

  teams: any[] = [];

  ngOnInit() {
    this.loadEmployees();
    this.loadDepartments();
    this.loadManagers();
    this.loadTeams();
  }

  loadTeams() {
    this.http.get('http://localhost:5000/api/teams').subscribe({
      next: (res: any) => this.teams = res.data,
      error: (err) => {
        this.teams = [];
        this.toast.error(err.error?.error || 'Failed to load teams');
      }
    });
  }

  loadDepartments() {
    this.http.get('http://localhost:5000/api/departments').subscribe({
      next: (res: any) => {
        this.departments = res.data;
      },
      error: (err) => this.toast.error(err.error?.error || 'Failed to load departments')
    });
  }

  loadManagers() {
    this.http.get('http://localhost:5000/api/employees/managers').subscribe({
      next: (res: any) => {
        this.managers = res.data;
        // Ensure Admin is at the top if present
        this.managers.sort((a, b) => {
          const aIsAdmin = a.role === 'admin';
          const bIsAdmin = b.role === 'admin';
          if (aIsAdmin && !bIsAdmin) return -1;
          if (!aIsAdmin && bIsAdmin) return 1;
          return 0;
        });
      },
      error: (err) => this.toast.error(err.error?.error || 'Failed to load managers')
    });
  }

  loadEmployees() {
    this.loading = true;
    this.http.get('http://localhost:5000/api/employees').subscribe({
      next: (res: any) => {
        this.employees = res.data;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.toast.error(err.error?.error || 'Failed to load employees');
      }
    });
  }

  openAddModal() {
    this.resetForm();
    this.isEditing = false;
    this.showAddModal = true;

    // Default to Admin manager if available
    const admin = this.managers.find(m => m.role === 'admin');
    if (admin) {
      this.newEmployee.reportingManagerId = admin._id;
    }
  }

  openEditModal(emp: any) {
    this.isEditing = true;
    this.currentEmployeeId = emp._id;
    this.newEmployee = {
      ...emp,
      departmentId: emp.departmentId?._id || '',
      reportingManagerId: emp.reportingManagerId?._id || '',
      teamId: emp.teamId?._id || '',
      password: ''
    };
    if (!this.newEmployee.role) this.newEmployee.role = 'employee';
    if (!this.newEmployee.level) this.newEmployee.level = 'N0';

    // Ensure geofence object exists (but we will hide UI for it)
    if (!this.newEmployee.geofence) {
      this.newEmployee.geofence = { latitude: 0, longitude: 0, radius: 500 };
    }
    // Ensure salary object exists
    if (!this.newEmployee.salary) {
      this.newEmployee.salary = { ctc: 0 };
    }
    if (this.newEmployee.salary.ctc === undefined || this.newEmployee.salary.ctc === null) {
      this.newEmployee.salary.ctc = 0;
    }
    this.showAddModal = true;
  }

  closeModal() {
    this.showAddModal = false;
    this.isEditing = false;
    this.currentEmployeeId = null;
    this.resetForm();
  }

  resetForm() {
    this.newEmployee = {
      fullName: '',
      email: '',
      password: '',
      role: 'employee',
      level: 'N0',
      designation: '',
      departmentId: '',
      reportingManagerId: '',
      teamId: '',
      salary: { ctc: 0 },
      geofence: { latitude: 0, longitude: 0, radius: 500 }
    };
  }

  saveEmployee() {
    if (this.isEditing && this.currentEmployeeId) {
      this.updateEmployee();
    } else {
      this.addEmployee();
    }
  }

  addEmployee() {
    const payload: any = { ...this.newEmployee };
    if (!payload.password) delete payload.password;
    if (!payload.teamId) delete payload.teamId;
    if (!payload.departmentId) delete payload.departmentId;
    if (!payload.reportingManagerId) delete payload.reportingManagerId;

    this.http.post('http://localhost:5000/api/employees', payload).subscribe({
      next: () => {
        this.toast.success('Employee added successfully');
        this.closeModal();
        this.loadEmployees();
      },
      error: (err) => this.toast.error(err.error?.error || 'Failed to add employee')
    });
  }

  updateEmployee() {
    const payload: any = { ...this.newEmployee };
    if (!payload.password) delete payload.password;
    if (!payload.teamId) delete payload.teamId;
    if (!payload.departmentId) delete payload.departmentId;
    if (!payload.reportingManagerId) delete payload.reportingManagerId;

    this.http.put(`http://localhost:5000/api/employees/${this.currentEmployeeId}`, payload).subscribe({
      next: () => {
        this.toast.success('Employee updated successfully');
        this.closeModal();
        this.loadEmployees();
      },
      error: (err) => this.toast.error(err.error?.error || 'Failed to update employee')
    });
  }

  deleteEmployee(id: string) {
    if (confirm('Are you sure you want to delete this employee?')) {
      this.http.delete(`http://localhost:5000/api/employees/${id}`).subscribe({
        next: () => {
          this.toast.success('Employee deleted successfully');
          this.loadEmployees();
        },
        error: (err) => this.toast.error(err.error?.error || 'Failed to delete employee')
      });
    }
  }

  viewProfile(id: string) {
    // Navigate to profile page
    // Must be implemented by injecting Router
    this.router.navigate(['/profile', id]);
  }

  generateOfferLetter(id: string) {
    this.http.post(`http://localhost:5000/api/documents/generate/offer_letter/${id}`, {}).subscribe({
      next: () => this.toast.success('Offer letter generated successfully'),
      error: (err) => this.toast.error(err.error?.error || 'Offer letter generation failed')
    });
  }

  generateJoiningLetter(id: string) {
    this.http.post(`http://localhost:5000/api/documents/generate/joining_letter/${id}`, {}).subscribe({
      next: () => this.toast.success('Joining letter generated successfully'),
      error: (err) => this.toast.error(err.error?.error || 'Joining letter generation failed')
    });
  }
}
