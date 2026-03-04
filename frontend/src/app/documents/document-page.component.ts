import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-document-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './document-page.component.html'
})
export class DocumentPageComponent implements OnInit {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  documents: any[] = [];
  role = this.authService.getRole();
  loading = true;

  ngOnInit() {
    this.loadDocuments();
  }

  loadDocuments() {
    const userId = this.authService.currentUserValue.id;
    this.http.get(`http://localhost:5000/api/documents/${userId}`).subscribe({
      next: (res: any) => {
        this.documents = res.data;
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  downloadDoc(url: string) {
    window.open(url, '_blank');
  }
}
