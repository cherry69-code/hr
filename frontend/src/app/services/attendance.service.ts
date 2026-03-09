import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AttendanceService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  requestCorrection(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/attendance/correction`, data);
  }

  getCorrectionRequests(status?: string): Observable<any> {
    const params: any = {};
    if (status) params.status = status;
    return this.http.get(`${this.apiUrl}/attendance/correction`, { params });
  }

  updateCorrectionStatus(id: string, data: { status: string, adminComment?: string }): Observable<any> {
    return this.http.put(`${this.apiUrl}/attendance/correction/${id}`, data);
  }
}
