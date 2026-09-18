import { useState } from 'react';

// Mirrors the original design's `style-hover` attribute: a base inline style
// merged with an override style while the pointer is over the element.
export default function Hoverable({ as: Tag = 'div', style, hoverStyle, children, ...rest }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Tag
      style={hovered ? { ...style, ...hoverStyle } : style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...rest}
    >
      {children}
    </Tag>
  );
}
