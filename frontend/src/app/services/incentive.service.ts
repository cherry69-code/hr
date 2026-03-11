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
    return this.http.post(`${this.apiUrl}/incentives/calculate`, data);
  }

  getIncentives(params?: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/incentives`, { params });
  }

  getMyIncentiveSummary(): Observable<any> {
    return this.http.get(`${this.apiUrl}/incentives/my-summary`);
  }

  approveIncentive(id: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/incentives/${id}/approve`, {});
  }

  createRevenue(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/incentives/revenue`, data);
  }

  getRevenue(params?: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/incentives/revenue`, { params });
  }

  deleteRevenue(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/incentives/revenue/${id}`);
  }

  calculateMonthly(month: number, year: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/incentives/calculate-monthly`, { month, year });
  }

  getCalculations(params?: any): Observable<any> {
    return this.http.get(`${this.apiUrl}/incentives/calculations`, { params });
  }

  approveCalculation(id: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/incentives/calculations/${id}/approve`, {});
  }

  rejectCalculation(id: string, reason: string = ''): Observable<any> {
    return this.http.put(`${this.apiUrl}/incentives/calculations/${id}/reject`, { reason });
  }

  payQuarter(year: number, quarter: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/incentives/payout/quarter`, { year, quarter });
  }

  getMySummaryV2(): Observable<any> {
    return this.http.get(`${this.apiUrl}/incentives/my-summary-v2`);
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
