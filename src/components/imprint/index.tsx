import retrieveImprint from "../../store/imprint";
import { Modal } from "../modal";
import "./style.scss";

interface Props {
    open: boolean;
    onClose: () => void;
}

export function Imprint({ open, onClose }: Props) {
    return (
        <Modal open={open} onClose={onClose} label="Imprint and privacy">
            <div className="imprintContent">{retrieveImprint()}</div>
        </Modal>
    );
}
