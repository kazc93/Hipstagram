// Interceptor HTTP — agrega el token JWT a TODAS las peticiones automáticamente
// También maneja la renovación silenciosa del token cuando expira (401)
import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  // Leer el token guardado en localStorage y clonarlo en el header Authorization
  const token = auth.obtenerToken();
  const reqConToken = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(reqConToken).pipe(
    catchError((error: HttpErrorResponse) => {
      // Si el backend responde 401 (token expirado) y hay refreshToken disponible
      if (error.status === 401 && auth.obtenerRefreshToken() && !req.url.includes('/refresh')) {
        // Intentar renovar el access token automáticamente sin molestar al usuario
        return auth.refresh().pipe(
          switchMap((res: any) => {
            // Reintentar el request original con el nuevo token
            const nuevoReq = req.clone({
              setHeaders: { Authorization: `Bearer ${res.token}` }
            });
            return next(nuevoReq);
          }),
          catchError(() => {
            // Si el refresh también falla (refresh expirado), cerrar sesión y redirigir al login
            auth.cerrarSesion();
            router.navigate(['/login']);
            return throwError(() => error);
          })
        );
      }
      return throwError(() => error);
    })
  );
};
