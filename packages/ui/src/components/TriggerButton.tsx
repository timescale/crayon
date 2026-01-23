export interface TriggerButtonProps {
  workflowName: string;
  onTrigger: (name: string) => void | Promise<void>;
  disabled?: boolean;
  children?: React.ReactNode;
}

/**
 * Button to trigger a workflow
 */
export function TriggerButton({
  workflowName,
  onTrigger,
  disabled = false,
  children,
}: TriggerButtonProps) {
  const handleClick = () => {
    onTrigger(workflowName);
  };

  return (
    <button disabled={disabled} onClick={handleClick} type="button">
      {children ?? "Trigger"}
    </button>
  );
}
