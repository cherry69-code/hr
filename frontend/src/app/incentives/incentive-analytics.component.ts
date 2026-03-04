import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';

@Component({
  selector: 'app-incentive-analytics',
  standalone: true,
  imports: [CommonModule, NgChartsModule],
  templateUrl: './incentive-analytics.component.html'
})
export class IncentiveAnalyticsComponent implements OnInit {

  public barChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    scales: {
      x: {},
      y: { min: 0 }
    },
    plugins: {
      legend: { display: true }
    }
  };
  public barChartType: ChartType = 'bar';
  public barChartLegend = true;

  public barChartData: ChartData<'bar'> = {
    labels: ['Q1', 'Q2', 'Q3', 'Q4'],
    datasets: [
      {
        data: [20000, 35000, 50000, 42000],
        label: 'Incentive Paid (₹)',
        backgroundColor: '#16A34A',
        hoverBackgroundColor: '#15803d'
      },
      {
        data: [5000, 8000, 12000, 10000],
        label: 'ESOP Value (₹)',
        backgroundColor: '#9333ea',
        hoverBackgroundColor: '#7e22ce'
      }
    ]
  };

  ngOnInit() {
    // In a real app, fetch data from backend here
  }
}
