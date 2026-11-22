import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle } from '@fluentui/react-components';
import { useStrings } from '../i18n/I18nContext';
import { AppIcon } from './AppIcon';

export interface MessageState {
    title: string;
    text: string;
    intent: 'success' | 'warning' | 'error';
}

/** Replacement of MessageBox.Show: themed, with the icon of the tool. */
export function MessageDialog(props: { message: MessageState | null; onClose: () => void }) {
    const s = useStrings();
    const { message } = props;
    return (
        <Dialog open={!!message} onOpenChange={(_e, data) => !data.open && props.onClose()}>
            <DialogSurface className="efa-dialog">
                <DialogBody>
                    <DialogTitle className={`efa-dialog-${message?.intent ?? 'success'}`}>
                        <span className="efa-dialog-title">
                            <AppIcon className="efa-logo" />
                            {message?.title}
                        </span>
                    </DialogTitle>
                    <DialogContent>
                        <div className="efa-message">{message?.text}</div>
                    </DialogContent>
                    <DialogActions>
                        <Button appearance="primary" onClick={props.onClose}>
                            {s.ok}
                        </Button>
                    </DialogActions>
                </DialogBody>
            </DialogSurface>
        </Dialog>
    );
}

export function HelpDialog(props: { open: boolean; onClose: () => void }) {
    const s = useStrings();
    return (
        <Dialog open={props.open} onOpenChange={(_e, data) => !data.open && props.onClose()}>
            <DialogSurface className="efa-dialog">
                <DialogBody>
                    <DialogTitle>
                        <span className="efa-dialog-title">
                            <AppIcon className="efa-logo" />
                            {s.helpTitle}
                        </span>
                    </DialogTitle>
                    <DialogContent>
                        <ol className="efa-help">
                            {s.helpSteps.map((step, n) => (
                                <li key={n}>{step}</li>
                            ))}
                        </ol>
                        <p className="efa-note">{s.readOnly}</p>
                    </DialogContent>
                    <DialogActions>
                        <Button appearance="primary" onClick={props.onClose}>
                            {s.close}
                        </Button>
                    </DialogActions>
                </DialogBody>
            </DialogSurface>
        </Dialog>
    );
}
