import Icon from "./Icon";

const iconIds = [
  "menu",
  "close",
  "ArrowDownAZ",
  "ArrowDownZA",
  "Languages",
  "ArrowUpDown",
  "user",
  "clock",
  "message",
  "arrowLeft",
  "squareCheck",
  "info",
  "folderPlus",
  "select",
  "remove",
  "edit",
  "undo",
  "chevron-down",
];

export default {
  title: "Components/Icon",
  component: Icon,
  argTypes: {
    id: {
      control: "select",
      options: iconIds,
    },
    color: {
      control: "color",
    },
    size: {
      control: "text",
    },
    strokeWidth: {
      control: { type: "number", min: 1, max: 5, step: 0.5 },
    },
  },
  args: {
    id: "info",
    color: "var(--gray15)",
    size: "2rem",
    strokeWidth: 2,
  },
};

export const Playground = {
  render: (args) => <Icon {...args} />,
};

export const Gallery = {
  render: (args) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(9rem, 1fr))",
        gap: "1rem",
      }}
    >
      {iconIds.map((id) => (
        <div
          key={id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            color: "var(--gray15)",
          }}
        >
          <Icon {...args} id={id} />
          <span style={{ fontSize: "0.85rem" }}>{id}</span>
        </div>
      ))}
    </div>
  ),
};
