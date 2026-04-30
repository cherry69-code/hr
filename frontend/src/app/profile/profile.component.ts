import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { ActivatedRoute } from '@angular/router';
import { ToastService } from '../services/toast.service';
import { environment } from '../../environments/environment';

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
  leaderboardStats: any = null;

  // For HR View/Edit
  isEditing = false;
  canEdit = false;
  currentUploadDocType = '';
  uploadingProfileImage = false;
  documentsIndex: any = {};

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
    this.http.get(`${environment.apiUrl}/employees/${userId}`).subscribe({
      next: (res: any) => {
        this.user = res.data;
        const currentUserRole = this.authService.getRole();
        // Allow edit if Admin, HR, or own profile (limited)
        // Actually, allow HR/Admin to edit ANY profile.
        this.canEdit = currentUserRole === 'hr' || currentUserRole === 'admin';
        this.initEditForm();
        this.loading = false;
        this.loadLeaderboardStats();
        this.loadDocuments();
      },
      error: () => this.loading = false
    });
  }

  loadDocuments() {
    if (!this.user?._id) return;
    this.http.get(`${environment.apiUrl}/documents/${this.user._id}`).subscribe({
      next: (res: any) => {
        const docs = res.data || [];
        const idx: any = {};
        for (const d of docs) {
          if (d && d.type) idx[String(d.type)] = d;
        }
        this.documentsIndex = idx;
      },
      error: () => {
        this.documentsIndex = {};
      }
    });
  }

  openDocumentByType(type: string) {
    const doc = this.documentsIndex?.[type];
    if (!doc?._id) {
      this.toast.error('Document not available');
      return;
    }
    this.http.get(`${environment.apiUrl}/documents/signed-url/${doc._id}`).subscribe({
      next: (res: any) => {
        const url = res.data?.url;
        if (url) window.open(url, '_blank');
        else this.toast.error('Download link not available');
      },
      error: (err) => this.toast.error(err.error?.error || 'Failed to open document')
    });
  }

  loadLeaderboardStats() {
    if (!this.user?._id) return;
    const d = new Date();
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const role = this.authService.getRole();
    const qs = (role === 'admin' || role === 'hr') ? `&employeeId=${this.user._id}` : '';
    this.http.get(`${environment.apiUrl}/leaderboard/me?month=${month}&year=${year}${qs}`).subscribe({
      next: (res: any) => this.leaderboardStats = res.data || null,
      error: () => this.leaderboardStats = null
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
      },
      joiningDate: this.user.joiningDate ? new Date(this.user.joiningDate).toISOString().split('T')[0] : ''
    };
  }

  get canUploadProfileImage() {
    const currentUser = this.authService.currentUserValue;
    const isSelf = currentUser?.id && (String(currentUser.id) === String(this.user?._id));
    return this.canEdit || isSelf;
  }

  get canActivateEmployee() {
    if (!this.canEdit) return false;
    if (!this.user?._id) return false;
    if (String(this.user.status || '') === 'active') return false;
    const hasOffer = this.hasDocument('offer_letter', 'offerLetter');
    const hasJoin = this.hasDocument('joining_letter', 'joiningLetter', 'joining_agreement', 'joiningAgreement');
    return hasOffer && hasJoin;
  }

  activateEmployee() {
    if (!this.canEdit || !this.user?._id) return;
    if (!this.user.joiningDate) {
      this.toast.error('Please set joining date before activating employee');
      return;
    }
    if (!this.canActivateEmployee) {
      this.toast.error('Offer letter and joining letter must be uploaded before activation');
      return;
    }
    if (!confirm('Activate this employee now?')) return;
    this.http.post(`${environment.apiUrl}/employees/${this.user._id}/activate`, {}).subscribe({
      next: (res: any) => {
        this.user = res.data;
        this.toast.success('Employee activated');
      },
      error: (err) => this.toast.error(err.error?.error || 'Failed to activate employee')
    });
  }

  // HR Only: Update Profile Details
  updateProfile() {
    if (!this.canEdit) return;

    const payload = {
      personalDetails: this.editForm.personalDetails,
      address: this.editForm.personalDetails.address,
      joiningDate: this.editForm.joiningDate || undefined
    };

    this.http.put(`${environment.apiUrl}/employees/${this.user._id}`, payload).subscribe({
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

    this.http.post(`${environment.apiUrl}/employees/${this.user._id}/send-letter`, {
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

  uploadDocument(docType: string) {
  }

  triggerUpload(docType: string, fileInput: HTMLInputElement) {
    if (!this.canEdit) return;
    this.currentUploadDocType = docType;
    fileInput.click();
  }

  triggerProfileImageUpload(fileInput: HTMLInputElement) {
    if (!this.canUploadProfileImage) return;
    fileInput.click();
  }

  onProfileImageSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';
    if (file.size > 2 * 1024 * 1024) {
      this.toast.error('Image too large. Please upload under 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = reader.result;
      this.uploadProfileImage(base64);
    };
  }

  uploadProfileImage(base64: any) {
    if (!this.user?._id) return;
    this.uploadingProfileImage = true;
    this.http.put(`${environment.apiUrl}/employees/${this.user._id}/profile-picture`, { file: base64 }).subscribe({
      next: (res: any) => {
        this.user = res.data;
        this.uploadingProfileImage = false;
        this.toast.success('Profile image updated');
      },
      error: (err) => {
        this.uploadingProfileImage = false;
        this.toast.error(err.error?.error || 'Upload failed');
      }
    });
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
    this.http.post(`${environment.apiUrl}/documents/upload`, {
      employeeId: this.user._id,
      type: docType,
      file: base64
    }).subscribe({
      next: (res: any) => {
        this.user = res.data;
        this.loadDocuments();
        this.uploading = false;
        this.toast.success(`${docType} uploaded successfully`);
      },
      error: (err) => {
        this.uploading = false;
        this.toast.error(err.error?.error || 'Upload failed');
      }
    });
  }

  private hasDocument(...keys: string[]): boolean {
    return keys.some((key) => {
      const indexed = this.documentsIndex?.[key];
      if (indexed?._id) return true;

      const userDoc = this.user?.documents?.[key];
      return Boolean(userDoc && (userDoc.publicId || userDoc.url));
    });
  }
}
