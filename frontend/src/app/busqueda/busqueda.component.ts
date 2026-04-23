import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { NavbarComponent } from '../components/navbar/navbar.component';
import { PostService } from '../services/post.service';

@Component({
  selector: 'app-busqueda',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent],
  templateUrl: './busqueda.component.html',
  styleUrl: './busqueda.component.css'
})
export class BusquedaComponent implements OnInit {
  termino: string = '';
  tipo: string = 'general';
  seccion: 'buscar' | 'explorar' = 'buscar';

  posts: any[] = [];
  buscando: boolean = false;
  buscado: boolean = false;
  mensajeAccion: string = '';

  page: number = 1;
  totalPages: number = 1;
  cargandoMas: boolean = false;

  comentarios: { [key: number]: any[] } = {};
  comentariosAbiertos: { [key: number]: boolean } = {};
  nuevoComentario: { [key: number]: string } = {};
  usuarioActual: any = null;

  constructor(
    private postService: PostService,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    const u = localStorage.getItem('usuario');
    if (u) this.usuarioActual = JSON.parse(u);

    this.route.queryParams.subscribe(params => {
      if (params['q']) {
        this.termino = params['q'];
        this.buscar();
      }
    });
  }

  cambiarSeccion(s: 'buscar' | 'explorar') {
    this.seccion = s;
    this.posts = [];
    this.buscado = false;
    this.page = 1;
    if (s === 'explorar') this.cargarExplorar();
  }

  buscar() {
    if (!this.termino.trim()) return;
    this.buscando = true;
    this.buscado = false;
    this.page = 1;

    const obs = this.tipo === 'hashtag'
      ? this.postService.buscarPorHashtag(this.termino, 1)
      : this.postService.buscarGeneral(this.termino, 1);

    obs.subscribe({
      next: (res: any) => {
        this.posts = res.posts;
        this.totalPages = res.totalPages ?? 1;
        this.buscando = false;
        this.buscado = true;
        this.cdr.detectChanges();
      },
      error: () => { this.buscando = false; this.buscado = true; this.cdr.detectChanges(); }
    });
  }

  cargarExplorar() {
    this.buscando = true;
    this.postService.explorar(1).subscribe({
      next: (res: any) => {
        this.posts = res.posts;
        this.totalPages = res.totalPages ?? 1;
        this.page = 1;
        this.buscando = false;
        this.cdr.detectChanges();
      },
      error: () => { this.buscando = false; this.cdr.detectChanges(); }
    });
  }

  cargarMas() {
    if (this.page >= this.totalPages || this.cargandoMas) return;
    this.cargandoMas = true;
    this.page++;

    const obs = this.seccion === 'explorar'
      ? this.postService.explorar(this.page)
      : this.tipo === 'hashtag'
        ? this.postService.buscarPorHashtag(this.termino, this.page)
        : this.postService.buscarGeneral(this.termino, this.page);

    obs.subscribe({
      next: (res: any) => {
        this.posts = [...this.posts, ...res.posts];
        this.totalPages = res.totalPages ?? 1;
        this.cargandoMas = false;
        this.cdr.detectChanges();
      },
      error: () => { this.cargandoMas = false; }
    });
  }

  votar(id_post: number, tipo: string) {
    this.postService.votar(id_post, tipo).subscribe({
      next: () => {
        if (this.seccion === 'explorar') { this.cargarExplorar(); } else { this.buscar(); }
      },
      error: (err) => console.error('Error al votar:', err)
    });
  }

  toggleComentarios(id_post: number) {
    this.comentariosAbiertos[id_post] = !this.comentariosAbiertos[id_post];
    if (this.comentariosAbiertos[id_post]) {
      this.postService.obtenerComentarios(id_post).subscribe({
        next: (res: any) => { this.comentarios[id_post] = res.comentarios; this.cdr.detectChanges(); }
      });
    }
  }

  enviarComentario(id_post: number) {
    const contenido = this.nuevoComentario[id_post];
    if (!contenido?.trim()) return;
    this.postService.crearComentario(id_post, contenido).subscribe({
      next: () => {
        this.nuevoComentario[id_post] = '';
        this.postService.obtenerComentarios(id_post).subscribe({
          next: (r: any) => { this.comentarios[id_post] = r.comentarios; this.cdr.detectChanges(); }
        });
      }
    });
  }

  eliminarComentario(id_post: number, id_comentario: number) {
    if (!confirm('¿Eliminar este comentario?')) return;
    this.postService.eliminarComentario(id_post, id_comentario).subscribe({
      next: () => {
        this.postService.obtenerComentarios(id_post).subscribe({
          next: (r: any) => { this.comentarios[id_post] = r.comentarios; this.cdr.detectChanges(); }
        });
      }
    });
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

  puedeEliminar(post: any): boolean {
    if (!this.usuarioActual) return false;
    return this.usuarioActual.username === post.username || this.usuarioActual.rol === 'ADMIN';
  }

  eliminarPost(id_post: number) {
    if (!confirm('¿Eliminar este post?')) return;
    this.postService.eliminarPost(id_post).subscribe({
      next: () => { this.posts = this.posts.filter(p => p.id_post !== id_post); this.cdr.detectChanges(); },
      error: (err) => {
        this.mensajeAccion = err?.error?.mensaje || 'Error al eliminar el post.';
        setTimeout(() => { this.mensajeAccion = ''; this.cdr.detectChanges(); }, 4000);
        this.cdr.detectChanges();
      }
    });
  }
}
