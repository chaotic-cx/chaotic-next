import { Component, ViewChild } from '@angular/core';
import { MenubarModule } from 'primeng/menubar';
import { MenuItem } from 'primeng/api';
import { Button } from 'primeng/button';
import { NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'chaotic-menubar',
  imports: [MenubarModule, Button, NgIf, RouterLink],
  templateUrl: './menubar.component.html',
  styleUrl: './menubar.component.css',
})
export class MenubarComponent {
  @ViewChild('darkToggle') darkToggle!: HTMLElement;

  items: MenuItem[] = [
    {
      icon: 'pi pi-home',
      label: 'Home',
      routerLink: '/',
    },
    {
      icon: 'pi pi-question',
      label: 'Get Started',
      routerLink: '/docs',
    },
    {
      icon: 'pi pi-gauge',
      label: 'Build Status',
      routerLink: '/status',
    },
    {
      icon: 'pi pi-receipt',
      label: 'Deploy log',
      routerLink: '/deploy-log',
    },
    {
      icon: 'pi pi-table',
      label: 'Package List',
      routerLink: '/package-list',
    },
    {
      icon: 'pi pi-chart-bar',
      label: 'Package Stats',
      routerLink: '/stats',
    },
    {
      icon: 'pi pi-trophy',
      label: 'Memorial v2',
      routerLink: '/memorial-v2',
    },
    {
      icon: 'pi pi-user',
      label: 'About',
      routerLink: '/about',
    },
  ];

  toggleDarkMode() {
    const element = document.querySelector('html') as HTMLElement;
    const toggle = document.querySelector('#dark-toggle') as HTMLElement;
    element.classList.toggle('dark-mode');
    toggle.classList.toggle('pi-moon');
    toggle.classList.toggle('pi-sun');
  }
}
