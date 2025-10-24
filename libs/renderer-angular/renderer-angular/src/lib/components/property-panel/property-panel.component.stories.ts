import { Meta, StoryObj, moduleMetadata, applicationConfig } from '@storybook/angular';
import { PropertyPanelComponent } from './property-panel.component';
import { PropertyPanelService } from '../../services/property-panel.service';
import { provideAnimations } from '@angular/platform-browser/animations';
import type { PropertySchema } from '@grafloria/renderer';

// Mock schema for ERD Table
const erdTableSchema: PropertySchema = {
  title: 'ERD Table',
  properties: [
    {
      key: 'tableName',
      label: 'Table Name',
      editor: 'string',
      group: 'General',
      order: 1,
      required: true,
      defaultValue: 'table1',
      validation: {
        required: true,
        pattern: '^[a-z_][a-z0-9_]*$',
        minLength: 1,
        maxLength: 64
      },
      description: 'Name of the database table'
    },
    {
      key: 'description',
      label: 'Description',
      editor: 'textarea',
      group: 'General',
      order: 2,
      description: 'Optional description of the table'
    },
    {
      key: 'primaryKey',
      label: 'Primary Key',
      editor: 'string',
      group: 'General',
      order: 3,
      defaultValue: 'id'
    },
    {
      key: 'fillColor',
      label: 'Fill Color',
      editor: 'color',
      group: 'Styling',
      order: 1,
      defaultValue: '#ffffff'
    },
    {
      key: 'strokeColor',
      label: 'Stroke Color',
      editor: 'color',
      group: 'Styling',
      order: 2,
      defaultValue: '#000000'
    },
    {
      key: 'strokeWidth',
      label: 'Stroke Width',
      editor: 'number',
      group: 'Styling',
      order: 3,
      defaultValue: 2,
      validation: { min: 0, max: 10 }
    },
    {
      key: 'borderRadius',
      label: 'Border Radius',
      editor: 'slider',
      group: 'Styling',
      order: 4,
      defaultValue: 4,
      validation: { min: 0, max: 20 }
    },
    {
      key: 'pattern',
      label: 'Border Pattern',
      editor: 'select',
      group: 'Styling',
      order: 5,
      defaultValue: 'solid',
      options: [
        { value: 'solid', label: 'Solid' },
        { value: 'dashed', label: 'Dashed' },
        { value: 'dotted', label: 'Dotted' }
      ]
    },
    {
      key: 'dashLength',
      label: 'Dash Length',
      editor: 'number',
      group: 'Styling',
      order: 6,
      defaultValue: 5,
      condition: {
        property: 'pattern',
        operator: '==',
        value: 'dashed'
      }
    },
    {
      key: 'shadowEnabled',
      label: 'Enable Shadow',
      editor: 'boolean',
      group: 'Effects',
      order: 1,
      defaultValue: false
    },
    {
      key: 'shadowBlur',
      label: 'Shadow Blur',
      editor: 'number',
      group: 'Effects',
      order: 2,
      defaultValue: 4,
      validation: { min: 0, max: 20 },
      condition: {
        property: 'shadowEnabled',
        operator: '==',
        value: true
      }
    },
    {
      key: 'opacity',
      label: 'Opacity',
      editor: 'slider',
      group: 'Effects',
      order: 3,
      defaultValue: 1,
      validation: { min: 0, max: 1 }
    }
  ],
  groups: [
    { name: 'General', order: 1 },
    { name: 'Styling', order: 2 },
    { name: 'Effects', order: 3 }
  ]
};

// Mock nodes
const mockNode1 = {
  id: 'node1',
  type: 'ERD.TABLE',
  label: 'Users Table',
  data: {
    tableName: 'users',
    description: 'User accounts and profiles',
    primaryKey: 'id',
    fillColor: '#e3f2fd',
    strokeColor: '#1976d2',
    strokeWidth: 2,
    borderRadius: 4,
    pattern: 'solid',
    shadowEnabled: false,
    opacity: 1
  }
};

const mockNode2 = {
  id: 'node2',
  type: 'ERD.TABLE',
  label: 'Products Table',
  data: {
    tableName: 'products',
    description: 'Product catalog',
    primaryKey: 'id',
    fillColor: '#fff3e0',
    strokeColor: '#f57c00',
    strokeWidth: 2,
    borderRadius: 4,
    pattern: 'solid',
    shadowEnabled: false,
    opacity: 1
  }
};

const mockNode3 = {
  id: 'node3',
  type: 'ERD.TABLE',
  label: 'Orders Table',
  data: {
    tableName: 'orders',
    description: 'Customer orders',
    primaryKey: 'order_id',
    fillColor: '#f3e5f5',
    strokeColor: '#7b1fa2',
    strokeWidth: 3,
    borderRadius: 8,
    pattern: 'dashed',
    dashLength: 6,
    shadowEnabled: true,
    shadowBlur: 8,
    opacity: 0.9
  }
};

const meta: Meta<PropertyPanelComponent> = {
  title: 'Components/PropertyPanel',
  component: PropertyPanelComponent,
  decorators: [
    moduleMetadata({
      imports: [PropertyPanelComponent],
      providers: [PropertyPanelService]
    }),
    applicationConfig({
      providers: [provideAnimations()]
    })
  ],
  tags: ['autodocs'],
  argTypes: {
    selectedNodes: {
      control: 'object',
      description: 'Selected node(s) to edit'
    },
    updateMode: {
      control: 'radio',
      options: ['immediate', 'deferred'],
      description: 'Update mode for property changes'
    },
    showHeader: {
      control: 'boolean',
      description: 'Show header section'
    },
    showActions: {
      control: 'boolean',
      description: 'Show action buttons in header'
    },
    collapsibleGroups: {
      control: 'boolean',
      description: 'Enable collapsible property groups'
    }
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Property panel component for editing diagram node properties. Supports schema-driven rendering, validation, multi-node editing, and more.'
      }
    }
  }
};

export default meta;
type Story = StoryObj<PropertyPanelComponent>;

// Setup function to register schema
function setupService(service: PropertyPanelService) {
  if (!service.hasSchema('ERD.TABLE')) {
    service.registerSchema('ERD.TABLE', erdTableSchema);
  }
}

/**
 * Default state with a single node selected
 */
export const Default: Story = {
  args: {
    selectedNodes: [mockNode1],
    updateMode: 'immediate',
    showHeader: true,
    showActions: false,
    collapsibleGroups: true
  },
  render: (args) => {
    return {
      props: args,
      template: `
        <div style="height: 100vh; display: flex;">
          <div style="flex: 1; background: #f5f5f5; display: flex; align-items: center; justify-content: center; color: #666;">
            Diagram Canvas Area
          </div>
          <div style="width: 350px; box-shadow: -2px 0 8px rgba(0,0,0,0.1);">
            <diagram-property-panel
              [selectedNodes]="selectedNodes"
              [updateMode]="updateMode"
              [showHeader]="showHeader"
              [showActions]="showActions"
              [collapsibleGroups]="collapsibleGroups"
              (propertyChanged)="onPropertyChanged($event)"
              (validationError)="onValidationError($event)">
            </diagram-property-panel>
          </div>
        </div>
      `
    };
  },
  play: async ({ canvasElement }) => {
    const service = (window as any).injector?.get(PropertyPanelService);
    if (service) {
      setupService(service);
    }
  }
};

/**
 * Empty state when no node is selected
 */
export const EmptyState: Story = {
  args: {
    selectedNodes: [],
    updateMode: 'immediate',
    showHeader: true,
    showActions: false,
    collapsibleGroups: true
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows the empty state message when no nodes are selected.'
      }
    }
  }
};

/**
 * Multi-node editing with mixed values
 */
export const MultiNodeEditing: Story = {
  args: {
    selectedNodes: [mockNode1, mockNode2, mockNode3],
    updateMode: 'immediate',
    showHeader: true,
    showActions: false,
    collapsibleGroups: true
  },
  parameters: {
    docs: {
      description: {
        story: 'Edit multiple nodes simultaneously. Properties with different values show "(multiple values)" placeholder.'
      }
    }
  }
};

/**
 * Deferred update mode with Save/Cancel buttons
 */
export const DeferredMode: Story = {
  args: {
    selectedNodes: [mockNode1],
    updateMode: 'deferred',
    showHeader: true,
    showActions: false,
    collapsibleGroups: true
  },
  parameters: {
    docs: {
      description: {
        story: 'Changes are not applied immediately. User must click Save to commit changes or Cancel to revert.'
      }
    }
  }
};

/**
 * With header actions enabled
 */
export const WithActions: Story = {
  args: {
    selectedNodes: [mockNode1],
    updateMode: 'immediate',
    showHeader: true,
    showActions: true,
    collapsibleGroups: true
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows action buttons (Delete, Duplicate) in the header.'
      }
    }
  }
};

/**
 * Without collapsible groups
 */
export const NonCollapsibleGroups: Story = {
  args: {
    selectedNodes: [mockNode1],
    updateMode: 'immediate',
    showHeader: true,
    showActions: false,
    collapsibleGroups: false
  },
  parameters: {
    docs: {
      description: {
        story: 'All property groups are always expanded and cannot be collapsed.'
      }
    }
  }
};

/**
 * Conditional property visibility
 */
export const ConditionalProperties: Story = {
  args: {
    selectedNodes: [mockNode3], // This node has pattern='dashed' so dashLength is visible
    updateMode: 'immediate',
    showHeader: true,
    showActions: false,
    collapsibleGroups: true
  },
  parameters: {
    docs: {
      description: {
        story: 'Some properties are conditionally visible. For example, "Dash Length" only appears when Border Pattern is "Dashed".'
      }
    }
  }
};

/**
 * Without header
 */
export const NoHeader: Story = {
  args: {
    selectedNodes: [mockNode1],
    updateMode: 'immediate',
    showHeader: false,
    showActions: false,
    collapsibleGroups: true
  },
  parameters: {
    docs: {
      description: {
        story: 'Panel without header section, showing only properties.'
      }
    }
  }
};

/**
 * Compact layout for mobile
 */
export const MobileView: Story = {
  args: {
    selectedNodes: [mockNode1],
    updateMode: 'immediate',
    showHeader: true,
    showActions: false,
    collapsibleGroups: true
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1'
    },
    docs: {
      description: {
        story: 'Responsive design adapts to mobile screen sizes (320px width).'
      }
    }
  },
  render: (args) => ({
    props: args,
    template: `
      <div style="width: 320px; height: 600px; margin: 0 auto; box-shadow: 0 0 20px rgba(0,0,0,0.2);">
        <diagram-property-panel
          [selectedNodes]="selectedNodes"
          [updateMode]="updateMode"
          [showHeader]="showHeader"
          [showActions]="showActions"
          [collapsibleGroups]="collapsibleGroups">
        </diagram-property-panel>
      </div>
    `
  })
};

/**
 * Tablet view
 */
export const TabletView: Story = {
  args: {
    selectedNodes: [mockNode1],
    updateMode: 'immediate',
    showHeader: true,
    showActions: true,
    collapsibleGroups: true
  },
  parameters: {
    viewport: {
      defaultViewport: 'tablet'
    },
    docs: {
      description: {
        story: 'Layout optimized for tablet screens (768px width).'
      }
    }
  },
  render: (args) => ({
    props: args,
    template: `
      <div style="width: 768px; height: 800px; margin: 0 auto; box-shadow: 0 0 20px rgba(0,0,0,0.2);">
        <diagram-property-panel
          [selectedNodes]="selectedNodes"
          [updateMode]="updateMode"
          [showHeader]="showHeader"
          [showActions]="showActions"
          [collapsibleGroups]="collapsibleGroups">
        </diagram-property-panel>
      </div>
    `
  })
};

/**
 * Dark mode
 */
export const DarkMode: Story = {
  args: {
    selectedNodes: [mockNode1],
    updateMode: 'immediate',
    showHeader: true,
    showActions: true,
    collapsibleGroups: true
  },
  parameters: {
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        story: 'Component automatically adapts to dark mode based on system preferences.'
      }
    }
  },
  render: (args) => ({
    props: args,
    template: `
      <div style="height: 100vh; display: flex; background: #1a1a1a;">
        <div style="flex: 1; background: #2d2d2d; display: flex; align-items: center; justify-content: center; color: #888;">
          Diagram Canvas Area (Dark)
        </div>
        <div style="width: 350px; box-shadow: -2px 0 8px rgba(0,0,0,0.5);">
          <diagram-property-panel
            [selectedNodes]="selectedNodes"
            [updateMode]="updateMode"
            [showHeader]="showHeader"
            [showActions]="showActions"
            [collapsibleGroups]="collapsibleGroups">
          </diagram-property-panel>
        </div>
      </div>
    `
  })
};

/**
 * All property types showcase
 */
export const AllPropertyTypes: Story = {
  args: {
    selectedNodes: [mockNode3], // Node with all property types visible
    updateMode: 'immediate',
    showHeader: true,
    showActions: false,
    collapsibleGroups: false
  },
  parameters: {
    docs: {
      description: {
        story: 'Demonstrates all supported property editor types: string, textarea, number, slider, boolean, color, select, and conditional properties.'
      }
    }
  }
};
