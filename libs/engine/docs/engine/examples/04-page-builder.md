# Example: Page Builder (Elementor-style)

Build a **visual page builder** like Elementor, Webflow, or Framer using the diagram engine.

---

## Overview

A page builder represents a web page as a **hierarchical tree** of components:

```
Section (full-width container)
├─ Row (horizontal layout)
│  ├─ Column (50% width)
│  │  ├─ Heading ("Welcome")
│  │  └─ Paragraph ("Lorem ipsum...")
│  └─ Column (50% width)
│     └─ Image ("hero.jpg")
└─ Row
   └─ Column (100% width)
      ├─ Button ("Get Started")
      └─ Button ("Learn More")
```

This is a **perfect fit** for our engine because:

- ✅ **Nodes = Components** (sections, columns, buttons, etc.)
- ✅ **Hierarchy = Parent/Child relationships**
- ✅ **Groups = Layout containers**
- ✅ **Metadata = Component properties** (text, colors, sizes)
- ✅ **Serialization = Save/load pages**
- ✅ **Undo/Redo = User-friendly editing**

---

## Component Type System

First, define component types using the **TypeRegistry**:

```typescript
import { DiagramEngine, TypeDefinition } from '@grafloria/diagram-engine';

const PageBuilderTypes: TypeDefinition = {
  name: 'pagebuilder',
  category: 'pagebuilder',
  version: '1.0.0',

  nodeTypes: [
    // Layout Components
    'pagebuilder.section',
    'pagebuilder.row',
    'pagebuilder.column',

    // Content Components
    'pagebuilder.heading',
    'pagebuilder.paragraph',
    'pagebuilder.image',
    'pagebuilder.video',
    'pagebuilder.button',
    'pagebuilder.form',
    'pagebuilder.divider',
    'pagebuilder.spacer',

    // Interactive Components
    'pagebuilder.accordion',
    'pagebuilder.tabs',
    'pagebuilder.carousel',
    'pagebuilder.modal'
  ],

  linkTypes: [],

  rules: [
    {
      name: 'section-cannot-be-nested',
      validate: (node) => {
        if (node.type === 'pagebuilder.section') {
          return node.parent === undefined;
        }
        return true;
      },
      message: 'Sections cannot be nested inside other components'
    },
    {
      name: 'column-must-be-in-row',
      validate: (node) => {
        if (node.type === 'pagebuilder.column') {
          return node.parent?.type === 'pagebuilder.row';
        }
        return true;
      },
      message: 'Columns must be inside a Row'
    },
    {
      name: 'content-must-be-in-column',
      validate: (node) => {
        const contentTypes = [
          'pagebuilder.heading',
          'pagebuilder.paragraph',
          'pagebuilder.image',
          'pagebuilder.button'
        ];

        if (contentTypes.includes(node.type)) {
          return node.parent?.type === 'pagebuilder.column';
        }
        return true;
      },
      message: 'Content components must be inside a Column'
    }
  ]
};

// Register types
const engine = new DiagramEngine();
engine.getValidationEngine().registerTypes(PageBuilderTypes);
```

---

## Creating Components

### Section (Full-Width Container)

```typescript
import { NodeModel } from '@grafloria/diagram-engine';

function createSection(options: {
  backgroundColor?: string;
  padding?: string;
  height?: string;
}): NodeModel {
  const section = new NodeModel({
    type: 'pagebuilder.section',
    position: { x: 0, y: 0 }, // Auto-layout will position this
    size: { width: 1200, height: 600 } // Full width
  });

  section.setMetadata('backgroundColor', options.backgroundColor || '#ffffff');
  section.setMetadata('padding', options.padding || '80px 20px');
  section.setMetadata('height', options.height || 'auto');

  return section;
}

// Usage
const heroSection = createSection({
  backgroundColor: '#1a1a1a',
  padding: '120px 20px',
  height: '100vh'
});

diagram.addNode(heroSection);
```

### Row (Horizontal Layout)

```typescript
function createRow(section: NodeModel): NodeModel {
  const row = new NodeModel({
    type: 'pagebuilder.row',
    position: { x: 0, y: 0 },
    size: { width: 1200, height: 400 }
  });

  row.setMetadata('gap', '20px');
  row.setMetadata('alignItems', 'center');

  // Set parent relationship
  row.setParent(section);

  diagram.addNode(row);

  return row;
}

// Usage
const heroRow = createRow(heroSection);
```

### Column (Vertical Layout)

```typescript
function createColumn(
  row: NodeModel,
  width: string = '50%'
): NodeModel {
  const column = new NodeModel({
    type: 'pagebuilder.column',
    position: { x: 0, y: 0 },
    size: { width: 600, height: 400 }
  });

  column.setMetadata('width', width);
  column.setMetadata('padding', '20px');
  column.setMetadata('verticalAlign', 'top');

  // Set parent relationship
  column.setParent(row);

  diagram.addNode(column);

  return column;
}

// Usage
const leftColumn = createColumn(heroRow, '50%');
const rightColumn = createColumn(heroRow, '50%');
```

### Content Components

#### Heading

```typescript
function createHeading(
  column: NodeModel,
  options: {
    text: string;
    level?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    color?: string;
    fontSize?: string;
  }
): NodeModel {
  const heading = new NodeModel({
    type: 'pagebuilder.heading',
    position: { x: 0, y: 0 },
    size: { width: 560, height: 80 }
  });

  heading.setMetadata('text', options.text);
  heading.setMetadata('level', options.level || 'h2');
  heading.setMetadata('color', options.color || '#000000');
  heading.setMetadata('fontSize', options.fontSize || '48px');
  heading.setMetadata('fontWeight', 'bold');

  heading.setParent(column);
  diagram.addNode(heading);

  return heading;
}

// Usage
const heroTitle = createHeading(leftColumn, {
  text: 'Build Anything You Can Imagine',
  level: 'h1',
  color: '#ffffff',
  fontSize: '56px'
});
```

#### Paragraph

```typescript
function createParagraph(
  column: NodeModel,
  text: string,
  options?: {
    color?: string;
    fontSize?: string;
    lineHeight?: string;
  }
): NodeModel {
  const paragraph = new NodeModel({
    type: 'pagebuilder.paragraph',
    position: { x: 0, y: 0 },
    size: { width: 560, height: 120 }
  });

  paragraph.setMetadata('text', text);
  paragraph.setMetadata('color', options?.color || '#666666');
  paragraph.setMetadata('fontSize', options?.fontSize || '18px');
  paragraph.setMetadata('lineHeight', options?.lineHeight || '1.6');

  paragraph.setParent(column);
  diagram.addNode(paragraph);

  return paragraph;
}

// Usage
const heroText = createParagraph(
  leftColumn,
  'Create stunning websites with our powerful visual editor. No coding required.',
  {
    color: '#cccccc',
    fontSize: '20px'
  }
);
```

#### Button

```typescript
function createButton(
  column: NodeModel,
  options: {
    text: string;
    link?: string;
    backgroundColor?: string;
    textColor?: string;
    size?: 'small' | 'medium' | 'large';
    variant?: 'primary' | 'secondary' | 'outline';
  }
): NodeModel {
  const button = new NodeModel({
    type: 'pagebuilder.button',
    position: { x: 0, y: 0 },
    size: { width: 200, height: 60 }
  });

  button.setMetadata('text', options.text);
  button.setMetadata('link', options.link || '#');
  button.setMetadata('backgroundColor', options.backgroundColor || '#2196F3');
  button.setMetadata('textColor', options.textColor || '#ffffff');
  button.setMetadata('size', options.size || 'medium');
  button.setMetadata('variant', options.variant || 'primary');
  button.setMetadata('borderRadius', '8px');
  button.setMetadata('padding', '16px 32px');

  button.setParent(column);
  diagram.addNode(button);

  return button;
}

// Usage
const ctaButton = createButton(leftColumn, {
  text: 'Get Started Free',
  link: '/signup',
  backgroundColor: '#2196F3',
  size: 'large',
  variant: 'primary'
});
```

#### Image

```typescript
function createImage(
  column: NodeModel,
  options: {
    src: string;
    alt: string;
    width?: string;
    height?: string;
    objectFit?: 'cover' | 'contain' | 'fill';
  }
): NodeModel {
  const image = new NodeModel({
    type: 'pagebuilder.image',
    position: { x: 0, y: 0 },
    size: { width: 560, height: 400 }
  });

  image.setMetadata('src', options.src);
  image.setMetadata('alt', options.alt);
  image.setMetadata('width', options.width || '100%');
  image.setMetadata('height', options.height || 'auto');
  image.setMetadata('objectFit', options.objectFit || 'cover');
  image.setMetadata('borderRadius', '12px');

  image.setParent(column);
  diagram.addNode(image);

  return image;
}

// Usage
const heroImage = createImage(rightColumn, {
  src: '/images/hero-illustration.png',
  alt: 'Hero illustration',
  objectFit: 'contain'
});
```

---

## Complete Page Example

Let's build a complete landing page:

```typescript
import {
  DiagramEngine,
  NodeModel,
  MoveNodeCommand,
  BatchCommand
} from '@grafloria/diagram-engine';

// Initialize engine
const engine = new DiagramEngine();
const diagram = engine.getModel();

engine.getValidationEngine().registerTypes(PageBuilderTypes);

// ============================================
// SECTION 1: Hero Section
// ============================================
const heroSection = createSection({
  backgroundColor: '#1a1a1a',
  padding: '120px 20px',
  height: '100vh'
});
diagram.addNode(heroSection);

const heroRow = createRow(heroSection);
const heroLeft = createColumn(heroRow, '50%');
const heroRight = createColumn(heroRow, '50%');

// Left column content
createHeading(heroLeft, {
  text: 'Build Anything You Can Imagine',
  level: 'h1',
  color: '#ffffff',
  fontSize: '56px'
});

createParagraph(
  heroLeft,
  'Create stunning websites with our powerful visual editor. No coding required.',
  { color: '#cccccc', fontSize: '20px' }
);

createButton(heroLeft, {
  text: 'Get Started Free',
  backgroundColor: '#2196F3',
  size: 'large'
});

// Right column content
createImage(heroRight, {
  src: '/images/hero.png',
  alt: 'Hero illustration'
});

// ============================================
// SECTION 2: Features Section
// ============================================
const featuresSection = createSection({
  backgroundColor: '#f5f5f5',
  padding: '80px 20px'
});
diagram.addNode(featuresSection);

const featuresRow = createRow(featuresSection);

// Feature 1
const feature1Col = createColumn(featuresRow, '33.33%');
createImage(feature1Col, {
  src: '/icons/fast.svg',
  alt: 'Fast icon',
  width: '64px',
  height: '64px'
});
createHeading(feature1Col, {
  text: 'Lightning Fast',
  level: 'h3',
  fontSize: '24px'
});
createParagraph(
  feature1Col,
  'Optimized for performance with 10,000+ components'
);

// Feature 2
const feature2Col = createColumn(featuresRow, '33.33%');
createImage(feature2Col, {
  src: '/icons/easy.svg',
  alt: 'Easy icon',
  width: '64px',
  height: '64px'
});
createHeading(feature2Col, {
  text: 'Easy to Use',
  level: 'h3',
  fontSize: '24px'
});
createParagraph(
  feature2Col,
  'Intuitive drag-and-drop interface'
);

// Feature 3
const feature3Col = createColumn(featuresRow, '33.33%');
createImage(feature3Col, {
  src: '/icons/responsive.svg',
  alt: 'Responsive icon',
  width: '64px',
  height: '64px'
});
createHeading(feature3Col, {
  text: 'Fully Responsive',
  level: 'h3',
  fontSize: '24px'
});
createParagraph(
  feature3Col,
  'Looks perfect on all devices'
);

// ============================================
// SECTION 3: Call-to-Action Section
// ============================================
const ctaSection = createSection({
  backgroundColor: '#2196F3',
  padding: '80px 20px'
});
diagram.addNode(ctaSection);

const ctaRow = createRow(ctaSection);
const ctaCol = createColumn(ctaRow, '100%');

createHeading(ctaCol, {
  text: 'Ready to Get Started?',
  level: 'h2',
  color: '#ffffff',
  fontSize: '48px'
});

createParagraph(
  ctaCol,
  'Join thousands of happy users today',
  { color: '#ffffff', fontSize: '24px' }
);

createButton(ctaCol, {
  text: 'Start Building',
  backgroundColor: '#ffffff',
  textColor: '#2196F3',
  size: 'large'
});

console.log('✅ Page created with', diagram.getNodes().length, 'components');
```

---

## Auto-Layout Algorithm

Automatically position components based on hierarchy:

```typescript
function autoLayoutPage(diagram: DiagramModel): void {
  let currentY = 0;

  // Get all sections (top-level nodes)
  const sections = diagram.getNodes().filter(
    node => node.type === 'pagebuilder.section' && !node.parent
  );

  sections.forEach(section => {
    // Position section
    section.position = { x: 0, y: currentY };

    // Auto-layout children (rows)
    const rows = section.getChildren().filter(
      child => child.type === 'pagebuilder.row'
    );

    let rowY = 0;
    rows.forEach(row => {
      row.position = { x: 0, y: rowY };

      // Auto-layout columns in row
      const columns = row.getChildren().filter(
        child => child.type === 'pagebuilder.column'
      );

      let columnX = 0;
      columns.forEach(column => {
        const widthPercent = parseInt(column.getMetadata('width') as string) / 100;
        const columnWidth = section.size.width * widthPercent;

        column.position = { x: columnX, y: 0 };
        column.size.width = columnWidth;

        columnX += columnWidth;

        // Auto-layout content in column
        let contentY = 0;
        const content = column.getChildren();

        content.forEach(item => {
          item.position = { x: 0, y: contentY };
          contentY += item.size.height + 20; // 20px spacing
        });

        // Adjust row height based on tallest column
        row.size.height = Math.max(row.size.height, contentY);
      });

      rowY += row.size.height;
    });

    // Update section height
    section.size.height = rowY;

    // Move to next section
    currentY += section.size.height;
  });
}

// Apply auto-layout
autoLayoutPage(diagram);
```

---

## Responsive Breakpoints

Define responsive behavior using metadata:

```typescript
function setResponsiveProperties(
  component: NodeModel,
  breakpoints: {
    mobile?: any;
    tablet?: any;
    desktop?: any;
  }
): void {
  component.setMetadata('responsive', {
    mobile: breakpoints.mobile || {},
    tablet: breakpoints.tablet || {},
    desktop: breakpoints.desktop || {}
  });
}

// Example: Responsive column widths
const column = createColumn(row, '50%');

setResponsiveProperties(column, {
  mobile: {
    width: '100%',  // Stack on mobile
    padding: '10px'
  },
  tablet: {
    width: '50%',   // Half width on tablet
    padding: '15px'
  },
  desktop: {
    width: '33.33%', // Third width on desktop
    padding: '20px'
  }
});
```

---

## Component Properties Panel

Get component properties for UI editing:

```typescript
function getComponentProperties(node: NodeModel): Record<string, any> {
  const type = node.type;

  // Return editable properties based on type
  if (type === 'pagebuilder.heading') {
    return {
      text: node.getMetadata('text'),
      level: node.getMetadata('level'),
      color: node.getMetadata('color'),
      fontSize: node.getMetadata('fontSize'),
      fontWeight: node.getMetadata('fontWeight')
    };
  }

  if (type === 'pagebuilder.button') {
    return {
      text: node.getMetadata('text'),
      link: node.getMetadata('link'),
      backgroundColor: node.getMetadata('backgroundColor'),
      textColor: node.getMetadata('textColor'),
      size: node.getMetadata('size'),
      variant: node.getMetadata('variant')
    };
  }

  if (type === 'pagebuilder.section') {
    return {
      backgroundColor: node.getMetadata('backgroundColor'),
      padding: node.getMetadata('padding'),
      height: node.getMetadata('height')
    };
  }

  return {};
}

// Usage
const button = diagram.getNode('button-123');
const props = getComponentProperties(button);

console.log('Button properties:', props);
// { text: 'Click Me', link: '#', backgroundColor: '#2196F3', ... }
```

---

## Drag-and-Drop Component Insertion

Add new components via drag-and-drop:

```typescript
import { AddNodeCommand } from '@grafloria/diagram-engine';

function handleComponentDrop(
  componentType: string,
  targetColumn: NodeModel,
  insertIndex: number
): void {
  let newComponent: NodeModel;

  switch (componentType) {
    case 'heading':
      newComponent = createHeading(targetColumn, {
        text: 'New Heading',
        level: 'h2'
      });
      break;

    case 'paragraph':
      newComponent = createParagraph(
        targetColumn,
        'New paragraph text...'
      );
      break;

    case 'button':
      newComponent = createButton(targetColumn, {
        text: 'New Button'
      });
      break;

    case 'image':
      newComponent = createImage(targetColumn, {
        src: '/placeholder.jpg',
        alt: 'Placeholder'
      });
      break;

    default:
      throw new Error(`Unknown component type: ${componentType}`);
  }

  // Execute as command for undo/redo
  engine.executeCommand(new AddNodeCommand(diagram, newComponent));

  // Re-apply auto-layout
  autoLayoutPage(diagram);

  console.log('✅ Component added:', newComponent.id);
}

// Usage: User drags "button" component onto column
handleComponentDrop('button', leftColumn, 2);
```

---

## Export to HTML/CSS

Generate production HTML from the page structure:

```typescript
function exportToHTML(diagram: DiagramModel): string {
  const sections = diagram.getNodes().filter(
    node => node.type === 'pagebuilder.section' && !node.parent
  );

  let html = '<!DOCTYPE html>\n<html>\n<head>\n';
  html += '  <meta charset="UTF-8">\n';
  html += '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
  html += '  <title>Generated Page</title>\n';
  html += '  <style>\n' + generateCSS() + '\n  </style>\n';
  html += '</head>\n<body>\n';

  sections.forEach(section => {
    html += renderSection(section);
  });

  html += '</body>\n</html>';

  return html;
}

function renderSection(section: NodeModel): string {
  const bg = section.getMetadata('backgroundColor');
  const padding = section.getMetadata('padding');

  let html = `  <section style="background-color: ${bg}; padding: ${padding};">\n`;

  const rows = section.getChildren();
  rows.forEach(row => {
    html += `    <div class="row">\n`;

    const columns = row.getChildren();
    columns.forEach(column => {
      const width = column.getMetadata('width');
      html += `      <div class="column" style="width: ${width};">\n`;

      const content = column.getChildren();
      content.forEach(item => {
        html += renderComponent(item);
      });

      html += `      </div>\n`;
    });

    html += `    </div>\n`;
  });

  html += `  </section>\n`;

  return html;
}

function renderComponent(component: NodeModel): string {
  const type = component.type;

  if (type === 'pagebuilder.heading') {
    const level = component.getMetadata('level');
    const text = component.getMetadata('text');
    const color = component.getMetadata('color');
    const fontSize = component.getMetadata('fontSize');

    return `        <${level} style="color: ${color}; font-size: ${fontSize};">${text}</${level}>\n`;
  }

  if (type === 'pagebuilder.paragraph') {
    const text = component.getMetadata('text');
    const color = component.getMetadata('color');
    const fontSize = component.getMetadata('fontSize');

    return `        <p style="color: ${color}; font-size: ${fontSize};">${text}</p>\n`;
  }

  if (type === 'pagebuilder.button') {
    const text = component.getMetadata('text');
    const link = component.getMetadata('link');
    const bg = component.getMetadata('backgroundColor');
    const textColor = component.getMetadata('textColor');
    const padding = component.getMetadata('padding');

    return `        <a href="${link}" style="background-color: ${bg}; color: ${textColor}; padding: ${padding}; display: inline-block;">${text}</a>\n`;
  }

  if (type === 'pagebuilder.image') {
    const src = component.getMetadata('src');
    const alt = component.getMetadata('alt');
    const width = component.getMetadata('width');

    return `        <img src="${src}" alt="${alt}" style="width: ${width};" />\n`;
  }

  return '';
}

// Export page
const html = exportToHTML(diagram);
console.log(html);

// Download as file
const blob = new Blob([html], { type: 'text/html' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'page.html';
a.click();
```

---

## Save/Load Page Projects

```typescript
// Save page
const pageData = engine.serialize();
localStorage.setItem('my-page', JSON.stringify(pageData));

// Or save to server
await fetch('/api/pages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Landing Page',
    data: pageData
  })
});

// Load page
const saved = localStorage.getItem('my-page');
if (saved) {
  engine.deserialize(JSON.parse(saved));
  autoLayoutPage(diagram);
  console.log('✅ Page loaded');
}
```

---

## Performance Tips

For large pages with 100+ components:

```typescript
// 1. Use viewport virtualization
const viewport = {
  x: 0,
  y: scrollY,
  width: window.innerWidth,
  height: window.innerHeight
};

const visibleComponents = diagram.getVisibleNodes(viewport);
// Only render visible components

// 2. Use LOD for editing mode
const zoom = 1.0; // Full zoom when editing
const componentsWithLOD = diagram.getNodesWithLOD(viewport, zoom);

// 3. Batch updates
const updates = components.map(c => new UpdateMetadataCommand(c, props));
engine.executeCommand(new BatchCommand(updates));

// 4. Debounce auto-layout
let layoutTimeout: any;
diagram.on('node:changed', () => {
  clearTimeout(layoutTimeout);
  layoutTimeout = setTimeout(() => autoLayoutPage(diagram), 100);
});
```

---

## Next Steps

- Add **component templates** (save/reuse component groups)
- Implement **undo/redo** for all editing operations
- Add **collaborative editing** (multiple users)
- Support **animations** (scroll effects, entrance animations)
- Add **mobile preview** mode
- Implement **A/B testing** variants

---

## Conclusion

The diagram engine provides a **powerful foundation** for building page builders:

✅ Hierarchical component tree
✅ Rich metadata system
✅ Validation rules
✅ Undo/redo
✅ Serialization
✅ High performance (1000+ components)

Build the next Elementor, Webflow, or Framer! 🚀
