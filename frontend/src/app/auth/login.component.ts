import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html'
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  credentials = {
    loginId: '', // Can be email or employee code
    password: ''
  };

  error = '';
  loading = false;
  bgStyle = {
    backgroundImage: 'url(assets/hrimage.jpg)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat'
  } as any;

  onSubmit() {
    this.loading = true;
    this.error = '';

    // Determine payload structure
    const payload: any = { password: this.credentials.password };
    const loginId = this.credentials.loginId.trim();

    // Simple heuristic: if it contains '@', treat as email, else Employee Code
    if (loginId.includes('@')) {
        payload.email = loginId;
    } else {
        payload.employeeCode = loginId;
    }

    this.authService.login(payload).subscribe({
      next: (res) => {
        const role = this.authService.getRole();
        if (role === 'employee') {
          this.router.navigate(['/home']);
        } else {
          this.router.navigate(['/dashboard']);
        }
      },
      error: (err) => {
        this.error = err.error?.error || 'Login failed';
        this.loading = false;
      }
    });
  }
}
