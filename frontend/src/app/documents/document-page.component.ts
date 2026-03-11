import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-document-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './document-page.component.html'
})
export class DocumentPageComponent implements OnInit {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  documents: any[] = [];
  role = this.authService.getRole();
  loading = true;

  ngOnInit() {
    this.loadDocuments();
  }

  loadDocuments() {
    const userId = this.authService.currentUserValue.id;
    this.http.get(`${environment.apiUrl}/documents/${userId}`).subscribe({
      next: (res: any) => {
        this.documents = res.data;
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  openDocument(id: string) {
    this.http.get(`${environment.apiUrl}/documents/signed-url/${id}`).subscribe({
      next: (res: any) => {
        const url = res.data?.url;
        if (url) window.open(url, '_blank');
        else this.toast.error('Download link not available');
      },
      error: (err) => this.toast.error(err.error?.error || 'Failed to get download link')
    });
  }
}
