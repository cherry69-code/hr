import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../services/toast.service';
import { SignaturePadComponent } from '../shared/components/signature-pad/signature-pad.component';

@Component({
  selector: 'app-joining-agreement-page',
  standalone: true,
  imports: [CommonModule, FormsModule, SignaturePadComponent],
  templateUrl: './joining-agreement-page.component.html'
})
export class JoiningAgreementPageComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  departments: any[] = [];
  teams: any[] = [];
  sending = false;
  showSignaturePad = false;

  form: any = {
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
    this.loadDepartments();
    this.loadTeams();
  }

  loadDepartments() {
    this.http.get('http://localhost:5000/api/departments').subscribe({
      next: (res: any) => this.departments = res.data || [],
      error: (err) => {
        this.departments = [];
        this.toast.error(err.error?.error || 'Failed to load departments');
      }
    });
  }

  loadTeams() {
    this.http.get('http://localhost:5000/api/teams').subscribe({
      next: (res: any) => this.teams = res.data || [],
      error: (err) => {
        this.teams = [];
        this.toast.error(err.error?.error || 'Failed to load teams');
      }
    });
  }

  initiateSend() {
    // Validate form
    if (!this.form.fullName || !this.form.email || !this.form.designation) {
        this.toast.error('Please fill in required fields (Name, Email, Designation)');
        return;
    }
    this.showSignaturePad = true;
  }

  onSigned(signature: string) {
    this.showSignaturePad = false;
    this.sendJoiningAgreement(signature);
  }

  onCancelled() {
    this.showSignaturePad = false;
  }

  sendJoiningAgreement(hrSignature: string) {
    this.sending = true;
    this.error = '';
    this.result = null;

    const payload: any = { ...this.form, hrSignature };
    Object.keys(payload).forEach((k) => {
      if (payload[k] === '' || payload[k] === null || payload[k] === undefined) {
        delete payload[k];
      }
    });

    this.http.post('http://localhost:5000/api/documents/joining-agreement/send', payload).subscribe({
      next: (res: any) => {
        this.result = res.data;
        this.sending = false;
        if (this.result?.emailSent) {
          this.toast.success('Joining agreement signed & sent successfully!');
        } else {
          const reason = this.result?.emailError ? ` (${this.result.emailError})` : '';
          this.toast.error(`Joining agreement generated, but email was not sent${reason}`);
        }
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to send joining agreement';
        this.sending = false;
        this.toast.error(this.error);
      }
    });
  }
}

