import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-department-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './department-list.component.html'
})
export class DepartmentListComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  departments: any[] = [];
  loading = false;
  showModal = false;
  isEditing = false;
  currentId: string | null = null;

  departmentForm = {
    name: '',
    description: ''
  };

  ngOnInit() {
    this.loadDepartments();
  }

  loadDepartments() {
    this.loading = true;
    this.http.get('http://localhost:5000/api/departments').subscribe({
      next: (res: any) => {
        this.departments = res.data;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.toast.error(err.error?.error || 'Failed to load departments');
      }
    });
  }

  openAddModal() {
    this.departmentForm = { name: '', description: '' };
    this.isEditing = false;
    this.showModal = true;
  }

  openEditModal(dept: any) {
    this.departmentForm = { name: dept.name, description: dept.description };
    this.currentId = dept._id;
    this.isEditing = true;
    this.showModal = true;
  }

  saveDepartment() {
    if (this.isEditing && this.currentId) {
      this.http.put(`http://localhost:5000/api/departments/${this.currentId}`, this.departmentForm).subscribe({
        next: () => {
          this.showModal = false;
          this.loadDepartments();
          this.toast.success('Department updated successfully');
        },
        error: (err) => {
          this.toast.error(err.error?.error || 'Failed to update department');
        }
      });
    } else {
      this.http.post('http://localhost:5000/api/departments', this.departmentForm).subscribe({
        next: () => {
          this.showModal = false;
          this.loadDepartments();
          this.toast.success('Department created successfully');
        },
        error: (err) => {
          this.toast.error(err.error?.error || 'Failed to create department');
        }
      });
    }
  }

  deleteDepartment(id: string) {
    if (confirm('Are you sure you want to delete this department?')) {
      this.http.delete(`http://localhost:5000/api/departments/${id}`).subscribe({
        next: () => {
          this.loadDepartments();
          this.toast.success('Department deleted successfully');
        },
        error: (err) => {
          this.toast.error(err.error?.error || 'Failed to delete department');
        }
      });
    }
  }
}
