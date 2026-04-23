import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PostService } from '../../services/post.service';

@Component({
  selector: 'app-crear-post',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './crear-post.component.html',
  styleUrl: './crear-post.component.css'
})
export class CrearPostComponent implements OnInit {
  @Output() postCreado = new EventEmitter<void>();

  usuarioActual: any = null;
  descripcion: string = '';
  hashtags: string = '';
  imagenSeleccionada: File | null = null;
  previewUrl: string | null = null;
  subiendo: boolean = false;
  mensaje: string = '';
  esError: boolean = false;
  mostrarForm: boolean = false;

  constructor(private postService: PostService) {}

  ngOnInit() {
    const userJson = localStorage.getItem('usuario');
    if (userJson) this.usuarioActual = JSON.parse(userJson);
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1200;
        let w = img.width;
        let h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else       { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => {
          if (blob) {
            this.imagenSeleccionada = new File([blob], file.name, { type: 'image/jpeg' });
            this.previewUrl = canvas.toDataURL('image/jpeg', 0.7);
          }
        }, 'image/jpeg', 0.7);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  onSubmit() {
    if (!this.descripcion || !this.imagenSeleccionada) return;
    this.subiendo = true;
    this.mensaje = '';

    // Convertir string "messi ucl fotos" → JSON array ["messi","ucl","fotos"]
    const hashtagArray = this.hashtags
      .split(/[\s,]+/)
      .map(t => t.toLowerCase().replace(/^#/, '').trim())
      .filter(t => t.length > 0);

    const formData = new FormData();
    formData.append('descripcion', this.descripcion);
    formData.append('imagen', this.imagenSeleccionada);
    if (hashtagArray.length > 0) {
      formData.append('hashtags', JSON.stringify(hashtagArray));
    }

    this.postService.crearPost(formData).subscribe({
      next: (res: any) => {
        this.mensaje = res.mensaje || 'Post creado. Pendiente de moderación.';
        this.esError = false;
        this.subiendo = false;
        // Limpiar formulario
        this.descripcion = '';
        this.hashtags = '';
        this.imagenSeleccionada = null;
        this.previewUrl = null;
        // Notificar al padre para recargar el feed sin reload de página
        setTimeout(() => { this.postCreado.emit(); this.mensaje = ''; }, 1500);
      },
      error: (err: any) => {
        this.subiendo = false;
        this.esError = true;
        this.mensaje = err.error?.mensaje || 'Error al subir publicación';
      }
    });
  }
}