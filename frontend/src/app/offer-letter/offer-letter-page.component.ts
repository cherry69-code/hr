import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../services/toast.service';
import { SignaturePadComponent } from '../shared/components/signature-pad/signature-pad.component';
import { environment } from '../../environments/environment';
import { timeout } from 'rxjs';

@Component({
  selector: 'app-offer-letter-page',
  standalone: true,
  imports: [CommonModule, FormsModule, SignaturePadComponent],
  templateUrl: './offer-letter-page.component.html'
})
export class OfferLetterPageComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  departments: any[] = [];
  teams: any[] = [];
  employees: any[] = [];
  sending = false;
  showSignaturePad = false;

  form: any = {
    employeeId: '', // Add employeeId support
    salutation: 'Mr.',
    fullName: '',
    fatherName: '',
    email: '',
    address: '',
    designation: '',
    departmentId: '',
    teamId: '',
    joiningDate: '',
    ctc: '',
    panNumber: '',
    aadharNumber: ''
  };

  result: any = null;
  error = '';

  ngOnInit() {
    this.loadEmployees();
    this.loadDepartments();
    this.loadTeams();
  }

  loadEmployees() {
    this.http.get(`${environment.apiUrl}/employees`).subscribe({
      next: (res: any) => this.employees = res.data || [],
      error: (err) => console.error('Failed to load employees', err)
    });
  }

  onEmployeeSelect(event: any) {
    const empId = event.target.value;
    if (!empId) {
        // Clear form if deselected? Or keep? Let's keep to avoid accidental data loss.
        return;
    }

    const emp = this.employees.find(e => e._id === empId);
    if (emp) {
        this.form.employeeId = emp._id;
        this.form.fullName = emp.fullName;
        this.form.email = emp.email;
        this.form.designation = emp.designation || '';
        this.form.address = emp.address || '';
        this.form.departmentId = emp.departmentId?._id || '';
        this.form.teamId = emp.teamId?._id || '';
        this.form.joiningDate = emp.joiningDate ? new Date(emp.joiningDate).toISOString().split('T')[0] : '';
        this.form.ctc = emp.salary?.ctc || '';
        this.form.fatherName = emp.personalDetails?.fatherName || '';

        // Note: PAN/Aadhar might be encrypted or not returned fully.
        // Backend decrypts if HR requests? Or we might need to fetch profile specifically.
        // For now, use what's in list.
    }
  }

  loadDepartments() {
    this.http.get(`${environment.apiUrl}/departments`).subscribe({
      next: (res: any) => this.departments = res.data || [],
      error: (err) => {
        this.departments = [];
        this.toast.error(err.error?.error || 'Failed to load departments');
      }
    });
  }

  loadTeams() {
    this.http.get(`${environment.apiUrl}/teams`).subscribe({
      next: (res: any) => this.teams = res.data || [],
      error: (err) => {
        this.teams = [];
        this.toast.error(err.error?.error || 'Failed to load teams');
      }
    });
  }

  initiateSend() {
    // Validate form before opening signature pad
    if (!this.form.fullName || !this.form.email || !this.form.designation) {
        this.toast.error('Please fill in required fields (Name, Email, Designation)');
        return;
    }
    this.showSignaturePad = true;
  }

  onSigned(signature: string) {
    this.showSignaturePad = false;
    this.sendOfferLetter(signature);
  }

  onCancelled() {
    this.showSignaturePad = false;
  }

  sendOfferLetter(hrSignature: string) {
    this.sending = true;
    this.error = '';
    this.result = null;

    const payload: any = { ...this.form, hrSignature };
    Object.keys(payload).forEach((k) => {
      if (payload[k] === '' || payload[k] === null || payload[k] === undefined) {
        delete payload[k];
      }
    });

    this.http.post(`${environment.apiUrl}/documents/offer-letter/send`, payload)
      .pipe(timeout(20000)) // 20s timeout
      .subscribe({
        next: (res: any) => {
          this.result = res.data;
          this.sending = false;
          // Check success flag even if status 200
          if (res.success && res.data?.emailSent) {
             this.toast.success(res.message || 'Offer letter sent successfully!');
          } else if (res.success) {
             // Email failed but document generated
             this.toast.error(res.message || 'Offer letter generated but email failed.');
          } else {
             this.toast.error(res.error || 'Operation failed');
          }
        },
        error: (err) => {
          this.sending = false;
          if (err.name === 'TimeoutError') {
             this.error = 'Request timed out. The server took too long to respond.';
          } else {
             this.error = err.error?.error || 'Failed to send offer letter';
          }
          this.toast.error(this.error);
        }
      });
  }
}
