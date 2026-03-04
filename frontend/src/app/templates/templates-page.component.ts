import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-templates-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './templates-page.component.html'
})
export class TemplatesPageComponent implements OnInit {
  activeTab: 'offer_letter' | 'joining_agreement' = 'offer_letter';
  content = '';
  loading = false;
  saving = false;
  private apiUrl = 'http://localhost:5000/api';

  placeholders = [
    { key: '{{fullName}}', desc: 'Employee Full Name' },
    { key: '{{fatherName}}', desc: 'Father\'s Name' },
    { key: '{{designation}}', desc: 'Job Title' },
    { key: '{{joiningDate}}', desc: 'Date of Joining' },
    { key: '{{ctc}}', desc: 'Annual CTC' },
    { key: '{{address}}', desc: 'Employee Address' },
    { key: '{{email}}', desc: 'Employee Email' }
  ];

  constructor(
    private http: HttpClient,
    private toast: ToastService
  ) {}

  ngOnInit() {
    this.loadTemplate();
  }

  loadTemplate() {
    this.loading = true;
    // Map to API types: 'joining_agreement' is same, 'offer_letter' is 'joining_letter' in backend for now?
    // Wait, backend logic:
    // if type === 'joining_agreement' -> joining_agreement_content.txt
    // if type === 'joining_letter' -> joining_letter_content.txt
    // The user wants to edit 'Joining Agreement' (which is the long legal text).
    // Let's stick to 'joining_agreement' and 'joining_letter' (if that's offer letter?).
    // Actually, in documentGenerator:
    // generateOfferLetterPdf uses joining_letter_content? No, generateOfferLetterPdf uses hardcoded structure for page 1 and 2.
    // generateJoiningAgreementPdf uses 'joining_letter_content.txt' (Wait, I used joining_letter_content for joining_agreement in previous step?)

    // Let's align:
    // Tab 1: Joining Agreement (Legal Text) -> API type 'joining_agreement'
    // Tab 2: Offer Letter (Simple) -> API type 'offer_letter' (if we support editing it)

    // In previous step I updated generateJoiningAgreementPdf to use 'joining_letter_content.txt'.
    // That seems like a naming confusion. It should be 'joining_agreement'.
    // Let's use 'joining_agreement' as the type.

    const type = this.activeTab;
    this.http.get<any>(`${this.apiUrl}/templates/${type}`).subscribe({
      next: (res) => {
        this.content = res.data.content || '';
        this.loading = false;
      },
      error: (err) => {
        this.toast.error('Failed to load template');
        this.loading = false;
      }
    });
  }

  saveTemplate() {
    this.saving = true;
    const type = this.activeTab;
    this.http.put<any>(`${this.apiUrl}/templates/${type}`, { content: this.content }).subscribe({
      next: (res) => {
        this.toast.success('Template updated successfully');
        this.saving = false;
      },
      error: (err) => {
        this.toast.error('Failed to save template');
        this.saving = false;
      }
    });
  }

  switchTab(tab: 'offer_letter' | 'joining_agreement') {
    this.activeTab = tab;
    this.loadTemplate();
  }
}
