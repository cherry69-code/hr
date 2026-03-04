import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SignaturePadComponent } from '../shared/components/signature-pad/signature-pad.component';
import { ToastService } from '../services/toast.service';
import { ToastComponent } from '../shared/components/toast/toast.component';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-esign-public',
  standalone: true,
  imports: [CommonModule, FormsModule, SignaturePadComponent, ToastComponent],
  templateUrl: './esign-public.component.html'
})
export class EsignPublicComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);
  private toast = inject(ToastService);

  token = '';
  loading = true;
  error = '';
  html: SafeHtml | null = null;
  agreed = false;
  signed = false;

  showSignaturePad = false;

  ngOnInit() {
    this.route.paramMap.subscribe((params) => {
      const t = params.get('token');
      if (t) {
        this.token = t;
        this.fetchDocument();
      } else {
        this.error = 'Invalid link';
        this.loading = false;
      }
    });
  }

  fetchDocument() {
    this.loading = true;
    this.error = '';
    // Use the new API endpoint
    this.http.get(`http://localhost:5000/api/esign/sign/${this.token}`).subscribe({
      next: (res: any) => {
        const htmlContent = res.data?.htmlContent || '';
        this.html = this.sanitizer.bypassSecurityTrustHtml(htmlContent);

        if (res.data?.status === 'EmployeeSigned' || res.data?.status === 'Completed') {
            this.signed = true;
            this.toast.success('You have already signed this document.');
        }

        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Invalid or expired link';
        this.loading = false;
      }
    });
  }

  startSign() {
    if (!this.agreed) {
      this.toast.error('Please accept terms');
      return;
    }
    this.showSignaturePad = true;
  }

  onSigned(signature: string) {
    this.showSignaturePad = false;
    this.loading = true;

    console.log('>>> SENDING SIGNATURE');
    console.log('Token:', this.token);
    console.log('Signature length:', signature ? signature.length : 'MISSING');

    // Post to the new API endpoint
    this.http.post(`http://localhost:5000/api/esign/sign/${this.token}`, {
      signature // Backend expects 'signature'
    }).subscribe({
      next: (res: any) => {
        console.log('>>> SIGNING SUCCESS:', res);
        this.toast.success('Signed successfully! Thank you.');
        this.signed = true;
        this.loading = false;
      },
      error: (err) => {
        console.error('>>> SIGNING ERROR:', err);
        this.toast.error(err.error?.error || 'Failed to sign');
        this.loading = false;
      }
    });
  }

  onCancelled() {
    this.showSignaturePad = false;
  }
}
