/**
 * Common Node Templates (Phase 4)
 * Pre-built templates for common use cases
 */

import type { NodeTemplate } from '../templates/NodeTemplate';

/**
 * Flexible template type with additional convenience properties
 * Makes NodeTemplate properties optional and adds convenience fields
 */
type FlexibleTemplate = Partial<NodeTemplate> & {
  id: string; // ID is always required
  structure: NodeTemplate['structure']; // structure is always required
  name?: string;
  description?: string;
  category?: string;
};

/**
 * User Avatar Template
 * Circular node for displaying user information
 */
export const UserAvatarTemplate: FlexibleTemplate = {
  id: 'user-avatar',
  name: 'User Avatar',
  description: 'Circular avatar with user name and status indicator',
  category: 'common',

  structure: {
    type: 'user-avatar',
    size: { width: 100, height: 100 },

    shape: {
      type: 'circle',
      fill: '#e3f2fd',
      stroke: '#2196f3',
      strokeWidth: 2,
    },

    html: {
      mode: 'template',
      template: `
        <div class="user-avatar">
          <div class="avatar-image">
            <img src="{{data.avatarUrl}}" alt="{{data.name}}" />
          </div>
          <div class="avatar-name">{{data.name}}</div>
          <div class="avatar-status {{data.status}}"></div>
        </div>
      `,
      className: 'node-user-avatar',
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px',
        fontFamily: 'system-ui, sans-serif',
      },
      events: {
        click: 'user:clicked',
        mouseenter: 'user:hovered',
        mouseleave: 'user:unhovered',
      },
      zIndex: 1,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'on-hover',
      top: { enabled: true },
      right: { enabled: true },
      bottom: { enabled: true },
      left: { enabled: true },
    },
  },

  defaultData: {
    name: 'User',
    avatarUrl: '',
    status: 'online', // online, offline, away, busy
  },
};

/**
 * Card Node Template
 * Rectangular card for displaying structured content
 */
export const CardNodeTemplate: FlexibleTemplate = {
  id: 'card-node',
  name: 'Card Node',
  description: 'Flexible card layout for content and actions',
  category: 'common',

  structure: {
    type: 'card',
    size: { width: 250, height: 150 },

    shape: {
      type: 'rect',
      cornerRadius: 12,
      fill: '#ffffff',
      stroke: '#e0e0e0',
      strokeWidth: 1,
    },

    html: {
      mode: 'template',
      template: `
        <div class="card-node">
          <div class="card-header">
            <h3>{{data.title}}</h3>
          </div>
          <div class="card-body">
            <p>{{data.description}}</p>
          </div>
          <div class="card-footer">
            <span class="card-meta">{{data.meta}}</span>
          </div>
        </div>
      `,
      className: 'node-card',
      style: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '12px',
        fontFamily: 'system-ui, sans-serif',
        backgroundColor: '#fff',
        borderRadius: '12px',
      },
      events: {
        click: 'card:clicked',
        dblclick: 'card:edited',
      },
      zIndex: 1,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'on-hover',
      top: { enabled: true },
      right: { enabled: true },
      bottom: { enabled: true },
      left: { enabled: true },
    },
  },

  defaultData: {
    title: 'Card Title',
    description: 'Card description goes here',
    meta: 'Additional info',
  },
};

/**
 * Button Node Template
 * Interactive button element
 */
export const ButtonNodeTemplate: FlexibleTemplate = {
  id: 'button-node',
  name: 'Button Node',
  description: 'Clickable button with icon and label',
  category: 'common',

  structure: {
    type: 'button',
    size: { width: 120, height: 40 },

    shape: {
      type: 'rect',
      cornerRadius: 8,
      fill: '#2196f3',
      stroke: '#1976d2',
      strokeWidth: 1,
    },

    html: {
      mode: 'template',
      template: `
        <button class="btn-node">
          <span class="btn-icon">{{data.icon}}</span>
          <span class="btn-label">{{data.label}}</span>
        </button>
      `,
      className: 'node-button',
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        border: 'none',
        borderRadius: '8px',
        backgroundColor: '#2196f3',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
      },
      events: {
        click: 'button:clicked',
        mouseenter: 'button:hovered',
        mouseleave: 'button:unhovered',
      },
      zIndex: 1,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'on-hover',
      top: { enabled: true },
      bottom: { enabled: true },
    },
  },

  defaultData: {
    label: 'Button',
    icon: '',
    variant: 'primary', // primary, secondary, danger, success
  },
};

/**
 * Input Field Template
 * Form input element
 */
export const InputFieldTemplate: FlexibleTemplate = {
  id: 'input-field',
  name: 'Input Field',
  description: 'Text input field with label',
  category: 'common',

  structure: {
    type: 'input',
    size: { width: 200, height: 60 },

    shape: {
      type: 'rect',
      cornerRadius: 6,
      fill: '#fafafa',
      stroke: '#ccc',
      strokeWidth: 1,
    },

    html: {
      mode: 'template',
      template: `
        <div class="input-field">
          <label class="input-label">{{data.label}}</label>
          <input
            type="{{data.type}}"
            placeholder="{{data.placeholder}}"
            value="{{data.value}}"
            class="input-control"
          />
        </div>
      `,
      className: 'node-input',
      style: {
        display: 'flex',
        flexDirection: 'column',
        padding: '8px',
        fontFamily: 'system-ui, sans-serif',
      },
      events: {
        input: 'input:changed',
        focus: 'input:focused',
        blur: 'input:blurred',
      },
      zIndex: 1,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'on-hover',
      right: { enabled: true },
      left: { enabled: true },
    },
  },

  defaultData: {
    label: 'Field Label',
    placeholder: 'Enter value...',
    value: '',
    type: 'text',
  },
};

/**
 * Badge/Label Template
 * Small label or status badge
 */
export const BadgeLabelTemplate: FlexibleTemplate = {
  id: 'badge-label',
  name: 'Badge Label',
  description: 'Small status badge or label',
  category: 'common',

  structure: {
    type: 'badge',
    size: { width: 80, height: 30 },

    shape: {
      type: 'rect',
      cornerRadius: 15,
      fill: '#4caf50',
      stroke: '#388e3c',
      strokeWidth: 1,
    },

    html: {
      mode: 'template',
      template: `
        <div class="badge-label {{data.variant}}">
          {{data.text}}
        </div>
      `,
      className: 'node-badge',
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: '4px 12px',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        fontWeight: '600',
        color: '#fff',
        borderRadius: '15px',
        textAlign: 'center',
      },
      events: {
        click: 'badge:clicked',
      },
      zIndex: 1,
    },

    ports: {
      enabled: false,
    },
  },

  defaultData: {
    text: 'Active',
    variant: 'success', // success, warning, error, info
  },
};

/**
 * Icon Node Template
 * Simple icon with optional label
 */
export const IconNodeTemplate: FlexibleTemplate = {
  id: 'icon-node',
  name: 'Icon Node',
  description: 'Icon-based node with tooltip',
  category: 'common',

  structure: {
    type: 'icon',
    size: { width: 60, height: 60 },

    shape: {
      type: 'circle',
      fill: '#f5f5f5',
      stroke: '#999',
      strokeWidth: 1,
    },

    html: {
      mode: 'template',
      template: `
        <div class="icon-node" title="{{data.tooltip}}">
          <span class="icon">{{data.icon}}</span>
        </div>
      `,
      className: 'node-icon',
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        fontSize: '24px',
      },
      events: {
        click: 'icon:clicked',
        mouseenter: 'icon:hovered',
      },
      zIndex: 1,
    },

    ports: {
      enabled: true,
      defaultVisibility: 'on-hover',
      top: { enabled: true },
      right: { enabled: true },
      bottom: { enabled: true },
      left: { enabled: true },
    },
  },

  defaultData: {
    icon: '⚙️',
    tooltip: 'Icon description',
  },
};

/**
 * Export all common templates
 */
export const CommonTemplates = {
  UserAvatar: UserAvatarTemplate,
  CardNode: CardNodeTemplate,
  ButtonNode: ButtonNodeTemplate,
  InputField: InputFieldTemplate,
  BadgeLabel: BadgeLabelTemplate,
  IconNode: IconNodeTemplate,
};
