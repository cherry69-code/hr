import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { ActivatedRoute } from '@angular/router';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html'
})
export class ProfileComponent implements OnInit {
  private http = inject(HttpClient);
  public authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  user: any = null;
  loading = false;
  uploading = false;

  // For HR View/Edit
  isEditing = false;
  canEdit = false;
  currentUploadDocType = '';

  // New fields for HR update
  editForm: any = {
    personalDetails: {},
    documents: {}
  };

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.loadProfile(id);
      } else {
        const currentUser = this.authService.currentUserValue;
        if (currentUser) {
          this.loadProfile(currentUser.id);
        }
      }
    });
  }

  loadProfile(userId: string) {
    this.loading = true;
    this.http.get(`http://localhost:5000/api/employees/${userId}`).subscribe({
      next: (res: any) => {
        this.user = res.data;
        const currentUserRole = this.authService.getRole();
        // Allow edit if Admin, HR, or own profile (limited)
        // Actually, allow HR/Admin to edit ANY profile.
        this.canEdit = currentUserRole === 'hr' || currentUserRole === 'admin';
        this.initEditForm();
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  initEditForm() {
    if (!this.user) return;
    this.editForm = {
      personalDetails: {
        fatherName: this.user.personalDetails?.fatherName || '',
        motherName: this.user.personalDetails?.motherName || '',
        dob: this.user.personalDetails?.dob ? new Date(this.user.personalDetails.dob).toISOString().split('T')[0] : '',
        bloodGroup: this.user.personalDetails?.bloodGroup || '',
        maritalStatus: this.user.personalDetails?.maritalStatus || '',
        address: this.user.address || ''
      }
    };
  }

  // HR Only: Update Profile Details
  updateProfile() {
    if (!this.canEdit) return;

    const payload = {
      personalDetails: this.editForm.personalDetails,
      address: this.editForm.personalDetails.address
    };

    this.http.put(`http://localhost:5000/api/employees/${this.user._id}`, payload).subscribe({
      next: (res: any) => {
        this.user = res.data;
        this.isEditing = false;
        this.toast.success('Profile updated successfully');
      },
      error: (err) => this.toast.error(err.error?.error || 'Failed to update profile')
    });
  }

  // HR Only: Send Letter
  sendLetter(type: string) {
    if (!this.canEdit) return;

    // Simple template for now, could be a modal with editor
    const content = type === 'offer_letter'
      ? `We are pleased to offer you the position of ${this.user.designation} at PropNinja.`
      : `Welcome to the team! Your joining date is ${new Date(this.user.joiningDate).toDateString()}.`;

    if (!confirm(`Send ${type.replace('_', ' ')} to ${this.user.email}?`)) return;

    this.http.post(`http://localhost:5000/api/employees/${this.user._id}/send-letter`, {
      type,
      letterContent: content
    }).subscribe({
      next: () => this.toast.success('Letter sent successfully'),
      error: (err) => this.toast.error(err.error?.error || 'Failed to send letter')
    });
  }

  formatDocName(doc: string): string {
    return doc.replace(/([A-Z])/g, ' $1').trim();
  }

  // Handle File Upload (Simulated for now as backend needs Multer/S3,
  // but we'll store a dummy URL or base64 if small, typically needs a proper /upload endpoint)
  // For this demo, we will just update the document status/url manually or assume an upload service exists.
  // Since we don't have a file upload endpoint ready in the prompt context, I will mock the "Upload"
  // by prompting for a URL or just marking it as "Uploaded".

  uploadDocument(docType: string) {
    // This is now triggered by the hidden file input
    // The HTML will click the input element
  }

  triggerUpload(docType: string, fileInput: HTMLInputElement) {
    if (!this.canEdit) return;
    this.currentUploadDocType = docType;
    fileInput.click();
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    // Reset input so same file can be selected again if needed
    event.target.value = '';

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = reader.result;
      this.uploadDocumentFile(this.currentUploadDocType, base64);
    };
  }

  uploadDocumentFile(docType: string, base64: any) {
    this.uploading = true;
    this.http.post('http://localhost:5000/api/documents/upload', {
      employeeId: this.user._id,
      type: docType,
      file: base64
    }).subscribe({
      next: (res: any) => {
        this.user = res.data;
        this.uploading = false;
        this.toast.success(`${docType} uploaded successfully`);
      },
      error: (err) => {
        this.uploading = false;
        this.toast.error(err.error?.error || 'Upload failed');
      }
    });
  }
}
