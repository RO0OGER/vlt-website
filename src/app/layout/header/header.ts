import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NAV } from '../../shared/nav';

@Component({
  selector: 'app-header',
  imports: [RouterLink],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  /** Top-level navigation with hover mega-menu children. */
  readonly nav = NAV;

  /** Desktop: index of the hovered nav item whose panel is open (null = closed). */
  readonly hover = signal<number | null>(null);
  /** Mobile: burger dropdown open state. */
  readonly mobileOpen = signal(false);
  /** Mobile: index of the expanded accordion section. */
  readonly openSection = signal<number | null>(null);

  readonly activeItem = computed(() => {
    const i = this.hover();
    return i != null ? (this.nav.at(i) ?? null) : null;
  });

  private closeTimer: ReturnType<typeof setTimeout> | undefined;

  enter(i: number): void {
    clearTimeout(this.closeTimer);
    this.hover.set(this.nav.at(i)?.children.length ? i : null);
  }

  leaveSoon(): void {
    clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => this.hover.set(null), 120);
  }

  cancelLeave(): void {
    clearTimeout(this.closeTimer);
  }

  toggleMobile(): void {
    this.mobileOpen.update((v) => !v);
  }

  toggleSection(i: number): void {
    if (!this.nav.at(i)?.children.length) return;
    this.openSection.update((cur) => (cur === i ? null : i));
  }
}
