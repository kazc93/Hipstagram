import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const token = localStorage.getItem('token');

    if (!token) {
      this.router.navigate(['/login']);
      return false;
    }

    // Si la ruta requiere rol ADMIN, verificarlo desde localStorage
    const requiereAdmin = route.data?.['requiereAdmin'] === true;
    if (requiereAdmin) {
      const usuarioJson = localStorage.getItem('usuario');
      const usuario = usuarioJson ? JSON.parse(usuarioJson) : null;
      if (usuario?.rol !== 'ADMIN') {
        this.router.navigate(['/home']);
        return false;
      }
    }

    return true;
  }
}