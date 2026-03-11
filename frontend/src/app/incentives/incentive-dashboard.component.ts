import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IncentiveService } from '../services/incentive.service';

@Component({
  selector: 'app-incentive-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './incentive-dashboard.component.html'
})
export class IncentiveDashboardComponent implements OnInit {
  private incentiveService = inject(IncentiveService);

  summary: any = null;
  calculations: any[] = [];
  loading = false;
  selectedYear = new Date().getFullYear();
  selectedMonth = new Date().getMonth() + 1;

  ngOnInit() {
    this.refresh();
  }

  refresh() {
    this.loading = true;
    this.incentiveService.getMySummaryV2().subscribe({
      next: (res: any) => this.summary = res.data || null,
      error: () => this.summary = null
    });
    this.incentiveService.getCalculations({ year: this.selectedYear, month: this.selectedMonth }).subscribe({
      next: (res: any) => {
        this.calculations = res.data || [];
        this.loading = false;
      },
      error: () => {
        this.calculations = [];
        this.loading = false;
      }
    });
  }
}
