import { Component, AfterViewInit, Renderer2, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

@Component({
  selector: 'app-verbandsanlaesse',
  standalone: true,
  templateUrl: './verbandsanlaesse.html',
  styleUrl: './verbandsanlaesse.css',
})
export class Verbandsanlaesse implements AfterViewInit {
  constructor(
    private renderer: Renderer2,
    @Inject(DOCUMENT) private document: Document,
  ) {}

  ngAfterViewInit(): void {
    const scripts = [
      '//ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.min.js',
      'https://www.guidle.com/js/jquery.ba-postmessage.min.js',
      'https://www.guidle.com/hosted/template_portal/microsite/static/js/micrositeContainerModule.js',
    ];
    this.loadSequentially(scripts, 0);
  }

  private loadSequentially(scripts: string[], index: number): void {
    if (index >= scripts.length) return;
    const script: HTMLScriptElement = this.renderer.createElement('script');
    script.src = scripts[index];
    script.onload = () => this.loadSequentially(scripts, index + 1);
    this.renderer.appendChild(this.document.body, script);
  }
}
