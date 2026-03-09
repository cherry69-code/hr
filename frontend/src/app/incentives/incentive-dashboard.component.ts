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

  data: any = null;

  ngOnInit() {
    this.incentiveService.getMyIncentiveSummary().subscribe({
      next: (res: any) => {
        this.data = res.data;
      },
      error: () => {
        this.data = null;
      }
    });
  }
}

