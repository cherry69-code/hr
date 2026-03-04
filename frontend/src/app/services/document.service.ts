import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DocumentService {
  private apiUrl = 'http://localhost:5000/api/documents';

  constructor(private http: HttpClient) {}

  signDocument(documentType: string, signatureData: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/sign`, { documentType, signatureData });
  }

  getDocuments(employeeId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${employeeId}`);
  }
}
