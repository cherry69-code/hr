import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-my-documents-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-documents-page.component.html'
})
export class MyDocumentsPageComponent implements OnInit {
  private http = inject(HttpClient);

  loading = false;
  docs: any[] = [];
  error = '';

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.error = '';
    this.http.get(`${environment.apiUrl}/vault/my`).subscribe({
      next: (res: any) => {
        this.docs = res.data || [];
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Failed to load documents';
        this.loading = false;
      }
    });
  }

  getDownloadUrl(fileUrl: string): string {
    if (!fileUrl) return '';
    if (fileUrl.startsWith('http')) return fileUrl;
    return `${environment.baseUrl}${fileUrl}`;
  }
}
