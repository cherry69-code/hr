import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SignaturePadComponent } from '../shared/components/signature-pad/signature-pad.component';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-hr-documents-page',
  standalone: true,
  imports: [CommonModule, FormsModule, SignaturePadComponent],
  templateUrl: './hr-documents-page.component.html'
})
export class HrDocumentsPageComponent implements OnInit {
  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);
  private toast = inject(ToastService);

  employees: any[] = [];
  pending: any[] = [];
  loadingEmployees = false;
  loadingPending = false;

  form: any = {
    employeeId: '',
    documentType: 'offer',
    htmlContent: ''
  };

  previewHtml: SafeHtml | null = null;
  error = '';
  sending = false;

  showSignaturePad = false;
  countersignDocId = '';

  ngOnInit() {
    this.loadEmployees();
    this.loadPending();
  }

  loadEmployees() {
    this.loadingEmployees = true;
    this.http.get('http://localhost:5000/api/employees').subscribe({
      next: (res: any) => {
        this.employees = res.data || [];
        this.loadingEmployees = false;
      },
      error: (err) => {
        this.employees = [];
        this.loadingEmployees = false;
        this.toast.error(err.error?.error || 'Failed to load employees');
      }
    });
  }

  loadPending() {
    this.loadingPending = true;
    this.http.get('http://localhost:5000/api/esign/pending').subscribe({
      next: (res: any) => {
        this.pending = res.data || [];
        this.loadingPending = false;
      },
      error: (err) => {
        this.pending = [];
        this.loadingPending = false;
        // this.toast.error(err.error?.error || 'Failed to load pending documents');
      }
    });
  }

  generate() {
    this.error = '';
    this.previewHtml = null;
    this.form.htmlContent = '';

    if (!this.form.employeeId) {
      this.error = 'Please select employee';
      return;
    }

    this.http.post('http://localhost:5000/api/esign/hr/generate', {
      employeeId: this.form.employeeId,
      documentType: this.form.documentType
    }).subscribe({
      next: (res: any) => {
        this.form.htmlContent = res.data?.htmlContent || '';
        this.updatePreview();
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to generate';
      }
    });
  }

  updatePreview() {
    this.previewHtml = this.sanitizer.bypassSecurityTrustHtml(this.form.htmlContent || '');
  }

  sendForEsign() {
    // This is legacy/custom generation, not the joining-agreement flow we built.
    // Leaving it as is, but focusing on the countersign part.
    this.sending = true;
    this.error = '';
    this.http.post('http://localhost:5000/api/esign/hr/send', {
      employeeId: this.form.employeeId,
      documentType: this.form.documentType,
      htmlContent: this.form.htmlContent,
      publicBaseUrl: 'http://localhost:4201'
    }).subscribe({
      next: (res: any) => {
        this.sending = false;
        if (res.data?.emailSent) {
          this.toast.success('Sent for e-sign successfully');
        } else {
          const reason = res.data?.emailError ? ` (${res.data.emailError})` : '';
          this.toast.error(`Document created, but email was not sent${reason}`);
        }
        this.loadPending();
      },
      error: (err) => {
        this.sending = false;
        this.error = err.error?.error || 'Failed to send';
        this.toast.error(this.error);
      }
    });
  }

  openCountersign(id: string) {
    this.countersignDocId = id;
    this.showSignaturePad = true;
  }

  onSigned(signature: string) {
    this.showSignaturePad = false;
    this.toast.info('Countersigning...');

    this.http.post(`http://localhost:5000/api/esign/hr-sign/${this.countersignDocId}`, {
      signature
    }).subscribe({
      next: () => {
        this.toast.success('Document countersigned successfully!');
        this.loadPending();
      },
      error: (err) => {
        this.toast.error(err.error?.error || 'Failed to countersign');
      }
    });
  }

  onCancelled() {
    this.showSignaturePad = false;
    this.countersignDocId = '';
  }
}
