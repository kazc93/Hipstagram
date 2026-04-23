import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from '../components/navbar/navbar.component';
import { PostService } from '../services/post.service';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [CommonModule, NavbarComponent],
  templateUrl: './perfil.component.html',
  styleUrl: './perfil.component.css'
})
export class PerfilComponent implements OnInit {
  usuario: any = null;
  posts: any[] = [];
  cargando = true;

  constructor(private postService: PostService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    const u = localStorage.getItem('usuario');
    if (u) this.usuario = JSON.parse(u);

    this.postService.obtenerMisPosts().subscribe({
      next: (res: any) => {
        this.posts = res.posts;
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  inicial(): string {
    return this.usuario?.nombre_completo?.charAt(0)?.toUpperCase()
      || this.usuario?.username?.charAt(0)?.toUpperCase()
      || '?';
  }

  badgeEstado(estado: string): string {
    const map: Record<string, string> = {
      PUBLICADO: 'badge-pub',
      PENDIENTE: 'badge-pend',
      RECHAZADO: 'badge-rech',
      BLOQUEADO: 'badge-bloq',
    };
    return map[estado] ?? '';
  }

  imgUrl(url: string): string {
    if (!url) return '';
    const backend = 'https://hipstagram-kevin.duckdns.org';
    if (url.startsWith('http')) {
      if (url.includes('s3.') || url.includes('amazonaws.com')) return url;
      try { return `${backend}${new URL(url).pathname}`; } catch { return url; }
    }
    return `${backend}${url}`;
  }

  totalLikes(): number {
    return this.posts.reduce((acc, p) => acc + (p.total_likes || 0), 0);
  }

  eliminarPost(id_post: number) {
    if (!confirm('¿Eliminar esta publicación?')) return;
    this.postService.eliminarPost(id_post).subscribe({
      next: () => {
        this.posts = this.posts.filter(p => p.id_post !== id_post);
        this.cdr.detectChanges();
      },
      error: (err: any) => console.error('Error al eliminar:', err)
    });
  }
}
