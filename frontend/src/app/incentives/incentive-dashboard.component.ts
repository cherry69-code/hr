import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IncentiveService } from '../services/incentive.service';

@Component({
  selector: 'app-incentive-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './incentive-dashboard.component.html'
})
export class IncentiveDashboardComponent implements OnInit {
  private incentiveService = inject(IncentiveService);

  data: any;

  payload: any = {
    ctc: 1200000,
    monthlyBasic: 50000,
    role: 'N1',
    target: 1000000,
    achievedNR: 6000000,
    teamIncentives: 0
  };

  ngOnInit() {
    this.incentiveService.calculate(this.payload).subscribe({
      next: (res: any) => {
        const payroll = res?.data || {};
        this.data = {
          ...this.payload,
          ...payroll,
          achievementMultiple: payroll?.incentive?.achievementMultiple
        };
      },
      error: () => {
        this.data = null;
      }
    });
  }
}

