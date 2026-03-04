import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) {
    const expectedRoles = route.data['roles'] as Array<string>;
    if (expectedRoles && !expectedRoles.includes(authService.getRole())) {
      router.navigate(['/dashboard']);
      return false;
    }
    return true;
  }

  router.navigate(['/auth/login']);
  return false;
};
