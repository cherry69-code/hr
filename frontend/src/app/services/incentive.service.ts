import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class IncentiveService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  calculate(data: any) {
    return this.http.post(`${this.apiUrl}/payroll/calculate`, data);
  }

  // Slabs
  getSlabs(): Observable<any> {
    return this.http.get(`${this.apiUrl}/slabs`);
  }

  createSlab(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/slabs`, data);
  }

  updateSlab(id: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/slabs/${id}`, data);
  }

  deleteSlab(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/slabs/${id}`);
  }

  // ESOPs
  grantESOP(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/esop/grant`, data);
  }

  getESOPStatus(employeeId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/esop/${employeeId}`);
  }
}
